import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { and, desc, eq, isNull, or, gt } from 'drizzle-orm';
import { db } from './db';
import { apiTokens, workspaceMembers, workspaces, users, type WorkspaceRole } from './schema';
import type { AuthUser } from './auth';
import type { Scope } from './scope';

/**
 * Personal access tokens for /api/v1.
 *
 * Format: `heli_<region>_<43 base64url chars>`.
 *
 * The region segment mirrors the session cookie's `region:sessionId` shape and
 * exists for the same reason: a token has to be validated against *some*
 * database, and without the region in the string there is no way to know which
 * one but to try them all or keep a global index.
 */

export const TOKEN_SCOPES = ['read', 'write', 'capture'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export function isTokenScope(v: unknown): v is TokenScope {
  return typeof v === 'string' && (TOKEN_SCOPES as readonly string[]).includes(v);
}

export type ApiToken = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: TokenScope[];
  lastUsedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
};

const PREFIX = 'heli';
const SECRET_BYTES = 32;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/* ── in-process cache ────────────────────────────────────────────────────── */

/**
 * Mirrors the shape of the LRU in search.ts. A burst of API calls should not be
 * one database read each — but the TTL means a revocation takes up to 30s to
 * propagate, which is documented in API.md.
 */
type CacheEntry = { at: number; value: ValidatedToken | null };
const CACHE_MAX = 512;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // Re-insert for LRU ordering.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: ValidatedToken | null): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Drop a token from the cache immediately — used on revoke. */
export function forgetToken(tokenHash: string): void {
  cache.delete(tokenHash);
}

/* ── mint ────────────────────────────────────────────────────────────────── */

export async function createToken(
  s: Scope,
  input: { name: string; scopes: TokenScope[]; expiresAt?: number | null }
): Promise<{ token: ApiToken; secret: string }> {
  const name = input.name.trim().slice(0, 80) || 'Untitled token';
  const scopes = input.scopes.filter(isTokenScope);
  if (scopes.length === 0) throw new Error('no_scopes');

  const secret = `${PREFIX}_${s.region}_${randomBytes(SECRET_BYTES).toString('base64url')}`;
  const now = Date.now();
  const row = {
    id: createId(),
    workspaceId: s.workspaceId,
    userId: s.userId,
    name,
    // Enough to recognise a token in a list, far too little to reconstruct it.
    prefix: secret.slice(0, PREFIX.length + s.region.length + 8),
    tokenHash: hash(secret),
    scopes: scopes.join(','),
    lastUsedAt: null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    createdAt: now
  };
  await db(s.region).insert(apiTokens).values(row);

  return {
    token: {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      name: row.name,
      prefix: row.prefix,
      scopes,
      lastUsedAt: null,
      expiresAt: row.expiresAt,
      createdAt: now
    },
    secret
  };
}

/* ── validate ────────────────────────────────────────────────────────────── */

export type ValidatedToken = {
  user: AuthUser;
  tokenId: string;
  scopes: TokenScope[];
};

/**
 * Pull the region out of `heli_<region>_<secret>`.
 *
 * Anchored regex rather than `split('_')`: the secret is base64url, whose
 * alphabet *includes* the underscore. Splitting produced four or more parts
 * for any token that happened to contain one — about three in four of them —
 * and those were rejected as malformed. Region names are lowercase ASCII
 * (`local`, `eu`, `us`, `apac`), so the boundary is unambiguous.
 *
 * The tail length is pinned at 43 rather than left as `+`, and that is what
 * keeps it distinct from a paired device's `heli_<region>_dev_<43>`. base64url
 * contains both `d` and `_`, so a PAT body *can* begin "dev_" — but a PAT body
 * is 43 characters in total and a device body is 47. Every secret ever minted
 * is exactly 43 (32 CSPRNG bytes, base64url), so this rejects nothing that used
 * to work. Do not loosen it back to `+`.
 */
const SECRET_RE = /^heli_([a-z]{2,8})_([A-Za-z0-9_-]{43})$/;

function parseRegion(secret: string): string | null {
  return SECRET_RE.exec(secret)?.[1] ?? null;
}

/**
 * Resolve a bearer secret to the acting user, or null.
 *
 * The role comes from the membership row at validation time, exactly as it does
 * for a session — so a token can never outrank its owner, and demoting someone
 * takes effect without touching their tokens.
 */
export async function validateToken(secret: string): Promise<ValidatedToken | null> {
  const region = parseRegion(secret);
  if (!region) return null;

  const key = hash(secret);
  const cached = cacheGet(key);
  if (cached) return cached.value;

  const d = db(region);
  const now = Date.now();

  // Drizzle rather than raw SQL on purpose: this is the one query that cannot
  // filter by workspace_id (it does not know the workspace yet), and
  // check-tenancy's Rule B only inspects raw SQL literals. Writing it here in
  // the query builder keeps the lint honest instead of needing an opt-out.
  const row = await d
    .select({
      id: apiTokens.id,
      workspaceId: apiTokens.workspaceId,
      userId: apiTokens.userId,
      tokenHash: apiTokens.tokenHash,
      scopes: apiTokens.scopes,
      lastUsedAt: apiTokens.lastUsedAt
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, key),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now))
      )
    )
    .get();

  if (!row) {
    cacheSet(key, null);
    return null;
  }

  // Constant-time compare on the hash. The lookup above already matched, so
  // this is belt-and-braces against a future change that makes the query
  // prefix-based or otherwise fuzzy.
  const a = Buffer.from(row.tokenHash, 'hex');
  const b = Buffer.from(key, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    cacheSet(key, null);
    return null;
  }

  const membership = await d
    .select({
      role: workspaceMembers.role,
      workspaceName: workspaces.name,
      email: users.email,
      username: users.username
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, row.workspaceId),
        eq(workspaceMembers.userId, row.userId)
      )
    )
    .get();

  // The owner left the workspace but the token outlived them. Fail closed.
  if (!membership) {
    cacheSet(key, null);
    return null;
  }

  const value: ValidatedToken = {
    user: {
      id: row.userId,
      email: membership.email,
      username: membership.username,
      region,
      workspaceId: row.workspaceId,
      workspaceName: membership.workspaceName,
      role: membership.role as WorkspaceRole
    },
    tokenId: row.id,
    scopes: row.scopes.split(',').filter(isTokenScope)
  };
  cacheSet(key, value);

  // At most hourly, and never awaited: last-used is a convenience for the
  // settings list, not something a request should pay for.
  const HOUR = 3_600_000;
  if (!row.lastUsedAt || now - row.lastUsedAt > HOUR) {
    d.update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, row.id))
      .run()
      .catch(() => {});
  }

  return value;
}

/* ── list / revoke ───────────────────────────────────────────────────────── */

export async function listTokens(s: Scope): Promise<ApiToken[]> {
  const rows = await db(s.region)
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.workspaceId, s.workspaceId),
        eq(apiTokens.userId, s.userId),
        isNull(apiTokens.revokedAt)
      )
    )
    .orderBy(desc(apiTokens.createdAt));

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    userId: r.userId,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes.split(',').filter(isTokenScope),
    lastUsedAt: r.lastUsedAt,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt
  }));
}

/** Revoke rather than delete, so a leaked token's hash stays reserved. */
export async function revokeToken(s: Scope, id: string): Promise<boolean> {
  const d = db(s.region);
  const row = await d
    .select({ hash: apiTokens.tokenHash })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.id, id),
        eq(apiTokens.workspaceId, s.workspaceId),
        eq(apiTokens.userId, s.userId)
      )
    )
    .get();
  if (!row) return false;

  await d.update(apiTokens).set({ revokedAt: Date.now() }).where(eq(apiTokens.id, id));
  // Without this, the LRU would keep authenticating the token for up to 30s
  // after the user pressed Revoke — which is exactly when they are watching.
  forgetToken(row.hash);
  return true;
}
