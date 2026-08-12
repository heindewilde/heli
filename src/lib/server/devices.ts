import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { and, desc, eq, isNull, or, gt } from 'drizzle-orm';
import { db } from './db';
import { devices, devicePairings, users, type WorkspaceRole } from './schema';
import type { AuthUser } from './auth';
import { getMembership, pickWorkspace } from './workspaces';
import { isTokenScope, type TokenScope } from './tokens';
import type { Scope } from './scope';

/**
 * Paired devices — the mobile app's credential.
 *
 * The mechanics are lifted wholesale from `tokens.ts` because they were right
 * there: the same `heli_<region>_…` envelope so `hooks.server.ts` can recognise
 * a bearer secret before it knows the kind, SHA-256 storage, a constant-time
 * compare, a 30 s LRU, and `lastUsedAt` written at most hourly and never
 * awaited.
 *
 * What is different is *who* the credential is. A PAT is workspace-scoped. A
 * device is user-scoped, and picks its workspace per request — see
 * `validateDevice`. That is why this is a separate table and a separate module
 * rather than a nullable column on `api_tokens`; the full argument is in
 * `schema.ts`.
 *
 * This file is in `ALLOW_FILES` in scripts/check-tenancy.ts: it filters on
 * `user_id` because a device belongs to a person, and there is no workspace
 * column here to filter on instead.
 */

export type Device = {
  id: string;
  userId: string;
  name: string;
  platform: string;
  appVersion: string | null;
  prefix: string;
  scopes: TokenScope[];
  pushEnabled: boolean;
  lastWorkspaceId: string | null;
  lastUsedAt: number | null;
  createdAt: number;
};

const PREFIX = 'heli';
const SECRET_BYTES = 32;

/** What a device is minted with. Narrower than the UI, wider than the extension. */
export const DEVICE_SCOPES: TokenScope[] = ['read', 'write'];

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/* ── secret format ───────────────────────────────────────────────────────── */

/**
 * `heli_<region>_dev_<43 base64url chars>`.
 *
 * The `dev_` marker is what tells a device token from a PAT before either has
 * been looked up. It is only unambiguous because **the tail length is pinned at
 * 43**: base64url's alphabet contains both `d` and `_`, so a PAT body can
 * legitimately begin `dev_` — but a PAT body is 43 characters in total, while a
 * device body is 4 + 43 = 47. Do not loosen `{43}` to `+`; that is the same
 * class of bug as the `split('_')` one `tokens.ts` documents.
 *
 * Every secret ever minted is exactly 43 chars (32 CSPRNG bytes, base64url), so
 * pinning the length is safe for existing tokens as well as new ones.
 */
const DEVICE_SECRET_RE = /^heli_([a-z]{2,8})_dev_([A-Za-z0-9_-]{43})$/;

export function isDeviceSecret(secret: string): boolean {
  return DEVICE_SECRET_RE.test(secret);
}

function parseRegion(secret: string): string | null {
  return DEVICE_SECRET_RE.exec(secret)?.[1] ?? null;
}

/* ── in-process cache ────────────────────────────────────────────────────── */

/**
 * Keyed by `<hash>:<workspaceId>`, not by hash alone.
 *
 * The resolved role depends on which workspace the request named, so a single
 * entry per secret would let a role cached for workspace A answer a request for
 * workspace B — a privilege escalation across tenants, which is the one thing
 * this cache must never do.
 */
type CacheEntry = { at: number; value: ValidatedDevice | null };
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
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: ValidatedDevice | null): void {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Drop every workspace entry for one device — used on revoke.
 *
 * A prefix sweep rather than a delete, because the key carries the workspace.
 * O(n) with n ≤ 512, and only on revoke, which is exactly the moment the user
 * is watching to see whether it worked.
 */
export function forgetDevice(tokenHash: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${tokenHash}:`)) cache.delete(key);
  }
}

/* ── mint ────────────────────────────────────────────────────────────────── */

async function createDevice(
  region: string,
  userId: string,
  input: { name: string; platform: string; appVersion?: string | null; workspaceId?: string | null }
): Promise<{ device: Device; secret: string }> {
  const name = input.name.trim().slice(0, 60) || 'Mobile device';
  const platform = input.platform === 'android' ? 'android' : 'ios';
  const secret = `${PREFIX}_${region}_dev_${randomBytes(SECRET_BYTES).toString('base64url')}`;
  const now = Date.now();

  const row = {
    id: createId(),
    userId,
    name,
    platform,
    appVersion: input.appVersion?.slice(0, 20) ?? null,
    // `heli_<region>_dev_` plus six characters — enough to pick a device out of
    // a list, far too little to reconstruct the secret.
    prefix: secret.slice(0, `${PREFIX}_${region}_dev_`.length + 6),
    tokenHash: hash(secret),
    scopes: DEVICE_SCOPES.join(','),
    pushToken: null,
    lastWorkspaceId: input.workspaceId ?? null,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: now
  };
  await db(region).insert(devices).values(row);

  return { device: toDevice(row), secret };
}

function toDevice(r: {
  id: string;
  userId: string;
  name: string;
  platform: string;
  appVersion: string | null;
  prefix: string;
  scopes: string;
  pushToken: string | null;
  lastWorkspaceId: string | null;
  lastUsedAt: number | null;
  createdAt: number;
}): Device {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    platform: r.platform,
    appVersion: r.appVersion,
    prefix: r.prefix,
    scopes: r.scopes.split(',').filter(isTokenScope),
    // The token itself is never returned — only whether one is registered.
    pushEnabled: r.pushToken !== null,
    lastWorkspaceId: r.lastWorkspaceId,
    lastUsedAt: r.lastUsedAt,
    createdAt: r.createdAt
  };
}

/* ── validate ────────────────────────────────────────────────────────────── */

export type ValidatedDevice = {
  user: AuthUser;
  deviceId: string;
  scopes: TokenScope[];
};

export type DeviceAuthFailure = { error: 'unauthorized' | 'forbidden'; message: string };

/**
 * Resolve a device secret plus a requested workspace to an acting user.
 *
 * Workspace resolution, in order:
 *   1. the `X-Heli-Workspace` header, when present
 *   2. `devices.last_workspace_id`, so a cold start lands where you left off
 *   3. the user's default membership (`pickWorkspace`)
 *
 * The role is read from the membership row on every validation, exactly as it
 * is for a session and for a PAT. That is what makes losing a membership *be*
 * the revocation: no row, no access to that workspace, with nothing written
 * here. A device that has been removed from every workspace gets 401; one asking
 * for a workspace it is not in gets 403 — never 404, which would leak whether a
 * workspace id exists.
 */
export async function validateDevice(
  secret: string,
  requestedWorkspaceId: string | null
): Promise<ValidatedDevice | DeviceAuthFailure> {
  const region = parseRegion(secret);
  if (!region) return { error: 'unauthorized', message: 'Invalid or expired device token.' };

  const key = hash(secret);
  const d = db(region);
  const now = Date.now();

  const row = await d
    .select({
      id: devices.id,
      userId: devices.userId,
      tokenHash: devices.tokenHash,
      scopes: devices.scopes,
      lastWorkspaceId: devices.lastWorkspaceId,
      lastUsedAt: devices.lastUsedAt
    })
    .from(devices)
    .where(
      and(
        eq(devices.tokenHash, key),
        isNull(devices.revokedAt),
        or(isNull(devices.expiresAt), gt(devices.expiresAt, now))
      )
    )
    .get();

  if (!row) return { error: 'unauthorized', message: 'Invalid or expired device token.' };

  // Belt-and-braces against a future change that makes the lookup above fuzzy.
  const a = Buffer.from(row.tokenHash, 'hex');
  const b = Buffer.from(key, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { error: 'unauthorized', message: 'Invalid or expired device token.' };
  }

  const wantedWorkspace = requestedWorkspaceId ?? row.lastWorkspaceId;
  const cacheKey = `${key}:${wantedWorkspace ?? '-'}`;
  const cached = cacheGet(cacheKey);
  if (cached?.value) return cached.value;

  const membership = wantedWorkspace
    ? await getMembership(region, wantedWorkspace, row.userId)
    : await pickWorkspace(region, row.userId);

  if (!membership) {
    // An explicit header for a workspace they are not in is a forbidden, so the
    // app can drop it from the switcher and fall back. A stale
    // `last_workspace_id` is not the user's fault, so fall back silently.
    if (requestedWorkspaceId) {
      return { error: 'forbidden', message: 'Not a member of that workspace.' };
    }
    const fallback = await pickWorkspace(region, row.userId);
    if (!fallback) {
      return { error: 'unauthorized', message: 'This account has no workspaces.' };
    }
    return finish(region, d, row, fallback, key, now);
  }

  return finish(region, d, row, membership, key, now);
}

async function finish(
  region: string,
  d: ReturnType<typeof db>,
  row: {
    id: string;
    userId: string;
    scopes: string;
    lastWorkspaceId: string | null;
    lastUsedAt: number | null;
  },
  membership: { workspaceId: string; workspaceName: string; role: WorkspaceRole },
  key: string,
  now: number
): Promise<ValidatedDevice> {
  const identity = await d
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(eq(users.id, row.userId))
    .get();

  const value: ValidatedDevice = {
    user: {
      id: row.userId,
      email: identity?.email ?? '',
      username: identity?.username ?? '',
      region,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspaceName,
      role: membership.role
    },
    deviceId: row.id,
    scopes: row.scopes.split(',').filter(isTokenScope)
  };
  cacheSet(`${key}:${membership.workspaceId}`, value);

  // At most hourly, never awaited. Also remembers the workspace so the next
  // cold start opens where the user left off.
  const HOUR = 3_600_000;
  const staleWorkspace = row.lastWorkspaceId !== membership.workspaceId;
  if (!row.lastUsedAt || now - row.lastUsedAt > HOUR || staleWorkspace) {
    d.update(devices)
      .set({ lastUsedAt: now, lastWorkspaceId: membership.workspaceId })
      .where(eq(devices.id, row.id))
      .run()
      .catch(() => {});
  }

  return value;
}

/* ── list / revoke / push ────────────────────────────────────────────────── */

/** Every live device belonging to this user, across all their workspaces. */
export async function listDevices(region: string, userId: string): Promise<Device[]> {
  const rows = await db(region)
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
    .orderBy(desc(devices.createdAt));
  return rows.map(toDevice);
}

/** Revoke rather than delete, so a leaked secret's hash stays reserved. */
export async function revokeDevice(
  region: string,
  userId: string,
  id: string
): Promise<boolean> {
  const d = db(region);
  const row = await d
    .select({ hash: devices.tokenHash })
    .from(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, userId)))
    .get();
  if (!row) return false;

  // Clearing the push token in the same write is the point of keeping it on
  // this row: revoking a lost phone must stop its notifications immediately,
  // not at the next scheduler tick that happens to notice.
  await d
    .update(devices)
    .set({ revokedAt: Date.now(), pushToken: null })
    .where(eq(devices.id, id));
  forgetDevice(row.hash);
  return true;
}

export async function setPushToken(
  region: string,
  deviceId: string,
  pushToken: string | null
): Promise<void> {
  await db(region)
    .update(devices)
    .set({ pushToken: pushToken?.slice(0, 200) ?? null })
    .where(eq(devices.id, deviceId));
}

/* ── pairing ─────────────────────────────────────────────────────────────── */

/**
 * Crockford base32: no I, L, O or U.
 *
 * The code is read off a screen and typed on a phone whenever the camera path
 * is not available, so the alphabet excludes every glyph pair people confuse.
 * Ten characters is 50 bits, which against a 120 s window and a per-IP claim
 * limit is not guessable — and it is short enough to type without resentment.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 10;
export const PAIRING_TTL_MS = 120_000;

const CODE_RE = /^([a-z]{2,8})-([0-9A-HJKMNP-TV-Z]{10})$/;

function newCode(): string {
  let out = '';
  // randomInt rather than randomBytes % 32: the modulo is unbiased at 32 into
  // 256, but writing it that way invites someone to change the alphabet length
  // later and introduce a bias nobody would notice.
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Accept what a human typed.
 *
 * Case-insensitive, hyphens and spaces ignored (the UI groups the code for
 * legibility), and Crockford's canonical confusions folded: I and L read as 1,
 * O reads as 0.
 */
export function normalizeCode(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const at = trimmed.indexOf('-');
  if (at === -1) return null;
  const region = trimmed.slice(0, at);
  const body = trimmed
    .slice(at + 1)
    .replace(/[\s-]/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  const candidate = `${region}-${body}`;
  return CODE_RE.test(candidate) ? candidate : null;
}

export function pairingRegion(code: string): string | null {
  return CODE_RE.exec(code)?.[1] ?? null;
}

export type Pairing = { code: string; expiresAt: number };

/** Mint a pairing code. Cookie-session only — a device may never call this. */
export async function createPairing(s: Scope): Promise<Pairing> {
  const code = `${s.region}-${newCode()}`;
  const now = Date.now();
  const expiresAt = now + PAIRING_TTL_MS;
  await db(s.region).insert(devicePairings).values({
    codeHash: hash(code),
    userId: s.userId,
    workspaceId: s.workspaceId,
    expiresAt,
    claimedAt: null,
    deviceId: null,
    createdAt: now
  });
  return { code, expiresAt };
}

export type PairingStatus =
  | { status: 'pending'; expiresAt: number }
  | { status: 'claimed'; device: { name: string; platform: string } }
  | { status: 'expired' };

export async function pairingStatus(s: Scope, code: string): Promise<PairingStatus> {
  const row = await db(s.region)
    .select()
    .from(devicePairings)
    .where(and(eq(devicePairings.codeHash, hash(code)), eq(devicePairings.userId, s.userId)))
    .get();
  if (!row) return { status: 'expired' };
  if (row.claimedAt && row.deviceId) {
    const dev = await db(s.region)
      .select({ name: devices.name, platform: devices.platform })
      .from(devices)
      .where(eq(devices.id, row.deviceId))
      .get();
    return { status: 'claimed', device: dev ?? { name: 'Device', platform: 'ios' } };
  }
  if (row.expiresAt <= Date.now()) return { status: 'expired' };
  return { status: 'pending', expiresAt: row.expiresAt };
}

export async function cancelPairing(s: Scope, code: string): Promise<void> {
  await db(s.region)
    .delete(devicePairings)
    .where(and(eq(devicePairings.codeHash, hash(code)), eq(devicePairings.userId, s.userId)));
}

export type ClaimResult =
  | { ok: true; secret: string; device: Device; userId: string; workspaceId: string | null }
  | { ok: false };

/**
 * Turn a code into a device token. Unauthenticated by necessity — the phone has
 * no credential yet; the code *is* the proof.
 *
 * Single use is enforced by a conditional UPDATE confirmed with
 * `rowsAffected === 1`, the same pattern the scheduler lease uses. Two phones
 * scanning one QR cannot both win, and the loser is told the code is spent
 * rather than silently getting a second credential.
 */
export async function claimPairing(
  code: string,
  meta: { name: string; platform: string; appVersion?: string | null }
): Promise<ClaimResult> {
  const region = pairingRegion(code);
  if (!region) return { ok: false };

  const now = Date.now();
  const codeHash = hash(code);
  const client = db(region);

  const row = await client
    .select()
    .from(devicePairings)
    .where(eq(devicePairings.codeHash, codeHash))
    .get();
  if (!row || row.claimedAt !== null || row.expiresAt <= now) return { ok: false };

  const { device, secret } = await createDevice(region, row.userId, {
    name: meta.name,
    platform: meta.platform,
    appVersion: meta.appVersion,
    workspaceId: row.workspaceId
  });

  // Claim it. If someone else got here first this affects no rows, and the
  // device we just minted has to go — better a wasted insert than two live
  // credentials from one code.
  const claimed = await client
    .update(devicePairings)
    .set({ claimedAt: now, deviceId: device.id })
    .where(and(eq(devicePairings.codeHash, codeHash), isNull(devicePairings.claimedAt)))
    .run();

  if (claimed.rowsAffected !== 1) {
    await client.delete(devices).where(eq(devices.id, device.id));
    return { ok: false };
  }

  return { ok: true, secret, device, userId: row.userId, workspaceId: row.workspaceId };
}
