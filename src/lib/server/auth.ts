import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcryptjs';
import { and, eq, lt, ne } from 'drizzle-orm';
import { client, db, primaryDb, defaultRegion } from './db';
import { TENANT_TABLES } from './migrate';
import {
  users,
  sessions,
  passwordResetTokens,
  emailRouting,
  oauthAccounts,
  workspaces,
  workspaceMembers,
  type WorkspaceRole
} from './schema';
import {
  countMembers,
  createWorkspace,
  ensureWorkspace,
  getMembership,
  getWorkspace,
  purgeWorkspace,
  reassignAuthorship
} from './workspaces';

// Stored as passwordHash for OAuth-only accounts that have no password set.
// Not a valid bcrypt hash, so bcrypt.compare will always return false against it.
export const OAUTH_SENTINEL = 'oauth_no_password';

const BCRYPT_ROUNDS = 10;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  region: string;
  /** Active workspace for this session. All CRM data is filtered by it. */
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

export class AuthError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertEmail(email: string): void {
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new AuthError('invalid_email', 'Invalid email address');
  }
}

function assertPassword(password: string): void {
  if (password.length < 8 || password.length > 72) {
    throw new AuthError('invalid_password', 'Password must be 8–72 characters');
  }
}

function assertUsername(username: string): void {
  if (username.length < 1 || username.length > 50) {
    throw new AuthError('invalid_username', 'Username must be 1–50 characters');
  }
}

export async function userCount(region?: string): Promise<number> {
  const rows = await db(region).select({ id: users.id }).from(users).limit(2);
  return rows.length;
}

/**
 * Is this a brand-new install with no accounts anywhere?
 *
 * Asks `email_routing` on the **primary** database, not `users` on the default
 * one. That table is the global registry — every `register()` writes a row to
 * it precisely so a login can be routed to the right regional database — and it
 * is the only place that knows about all regions at once.
 *
 * `userCount()` was counting `users` in the *default* region, which on a
 * multi-region deployment is a local file that never receives a row: the real
 * accounts live in EU/US/APAC. So it answered "yes, brand new" forever, and
 * every registration flag downstream of it silently stopped working in the
 * cloud while behaving correctly on self-host.
 */
export async function isFirstUser(): Promise<boolean> {
  const rows = await primaryDb().select({ email: emailRouting.email }).from(emailRouting).limit(1);
  return rows.length === 0;
}

// Self-host safe default: once at least one account exists, signups are closed
// unless the operator opts back in with ENABLE_REGISTRATION=1. The legacy
// DISABLE_REGISTRATION=1 remains a hard kill switch and still wins if set.
// The first signup is always allowed so an empty install can bootstrap.
export async function isRegistrationDisabled(inviteToken?: string | null): Promise<boolean> {
  // Bootstrap comes first, ahead of the kill switch. An operator who sets
  // DISABLE_REGISTRATION=1 in their .env *before* first boot — which the README
  // explicitly invites — could otherwise never create the first account, and
  // there is no way out of that from inside the app. The check above used to
  // return early and lock them out, contradicting this function's own comment
  // and the invariant recorded in CLAUDE.md.
  //
  // Cheap enough to run first: userCount is a LIMIT 2.
  if (await isFirstUser()) return false;
  if (process.env.DISABLE_REGISTRATION === '1') return true;
  // A live invite admits its addressee even though public signup is closed.
  // Without this, invites are dead on arrival on every self-host — the default
  // there is closed-after-first-user, so the owner could never add a colleague.
  // DISABLE_REGISTRATION stays a hard kill switch and is checked above.
  if (inviteToken) {
    const { getInvite } = await import('./invites');
    if (await getInvite(inviteToken)) return false;
  }
  return process.env.ENABLE_REGISTRATION !== '1';
}

/**
 * Move a session to another workspace by minting a fresh session id.
 *
 * Rotating rather than updating in place is deliberate: the service worker
 * caches GET /api/* keyed by URL with `Vary: Cookie`, and switching workspaces
 * under the *same* cookie would let it serve the previous workspace's cached
 * responses. A new cookie value partitions that cache naturally, and rotating
 * on a privilege-context change is good hygiene anyway.
 */
export async function switchWorkspace(
  currentSessionId: string,
  userId: string,
  region: string,
  workspaceId: string
): Promise<{ sessionId: string; expiresAt: number }> {
  const m = await getMembership(region, workspaceId, userId);
  if (!m) throw new AuthError('not_a_member');
  await db(region).delete(sessions).where(eq(sessions.id, currentSessionId));
  const session = await createSession(userId, region, workspaceId);
  return { sessionId: session.id, expiresAt: session.expiresAt };
}

async function lookupRegion(email: string): Promise<string> {
  const row = await primaryDb()
    .select()
    .from(emailRouting)
    .where(eq(emailRouting.email, email))
    .get();
  return row?.region ?? defaultRegion();
}

async function createSession(
  userId: string,
  region: string,
  activeWorkspaceId: string
): Promise<{ id: string; expiresAt: number }> {
  const id = `${region}:${createId()}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db(region).insert(sessions).values({ id, userId, activeWorkspaceId, expiresAt });
  return { id, expiresAt };
}

export async function register(input: {
  email: string;
  password: string;
  username: string;
  region?: string;
}): Promise<{ user: AuthUser; sessionId: string; expiresAt: number }> {
  const email = normalizeEmail(input.email);
  assertEmail(email);
  assertPassword(input.password);
  const username = input.username.trim();
  assertUsername(username);
  const region = input.region ?? defaultRegion();

  const existingRouting = await primaryDb()
    .select()
    .from(emailRouting)
    .where(eq(emailRouting.email, email))
    .get();
  if (existingRouting) {
    throw new AuthError('email_taken', 'An account with that email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const id = createId();
  const now = Date.now();

  await db(region).insert(users).values({
    id,
    email,
    passwordHash,
    username,
    createdAt: now
  });
  await primaryDb().insert(emailRouting).values({ email, region });

  const workspaceName = `${username}'s workspace`;
  const workspaceId = await createWorkspace(region, id, workspaceName);

  const session = await createSession(id, region, workspaceId);
  return {
    user: { id, email, username, region, workspaceId, workspaceName, role: 'owner' },
    sessionId: session.id,
    expiresAt: session.expiresAt
  };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser; sessionId: string; expiresAt: number }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new AuthError('invalid_credentials');
  if (input.password.length === 0 || input.password.length > 200) {
    throw new AuthError('invalid_credentials');
  }

  const region = await lookupRegion(email);
  const user = await db(region).select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    // Constant-ish time: do a dummy hash compare so timing doesn't reveal account existence.
    await bcrypt.compare(input.password, '$2b$10$0000000000000000000000000000000000000000000000000000');
    throw new AuthError('invalid_credentials');
  }
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new AuthError('invalid_credentials');

  const m = await ensureWorkspace(region, user.id, `${user.username ?? 'My'} workspace`);
  const session = await createSession(user.id, region, m.workspaceId);
  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      region,
      workspaceId: m.workspaceId,
      workspaceName: m.workspaceName,
      role: m.role
    },
    sessionId: session.id,
    expiresAt: session.expiresAt
  };
}

export async function validateSession(
  cookieValue: string
): Promise<{ user: AuthUser; sessionId: string } | null> {
  const colon = cookieValue.indexOf(':');
  if (colon === -1) return null;
  const region = cookieValue.slice(0, colon);
  if (!region) return null;

  // One query for the common case. The workspace joins are LEFT so that a
  // session pointing at a workspace the user no longer belongs to still
  // resolves the user — the slow path below then moves them somewhere valid.
  // That missing membership row IS the revocation mechanism: remove someone
  // from a workspace and their sessions stop resolving to it immediately,
  // with no session-sweeping code.
  const row = await db(region)
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      activeWorkspaceId: sessions.activeWorkspaceId,
      userId: users.id,
      email: users.email,
      username: users.username,
      memberWorkspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      workspaceName: workspaces.name
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, sessions.activeWorkspaceId),
        eq(workspaceMembers.userId, sessions.userId)
      )
    )
    .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(sessions.id, cookieValue))
    .get();

  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    await db(region).delete(sessions).where(eq(sessions.id, cookieValue));
    return null;
  }

  let workspaceId = row.memberWorkspaceId;
  let workspaceName = row.workspaceName;
  let role = row.role as WorkspaceRole | null;

  if (!workspaceId || !workspaceName || !role) {
    // Session has no workspace, or points at one the user was removed from.
    const m = await ensureWorkspace(region, row.userId, `${row.username ?? 'My'} workspace`);
    workspaceId = m.workspaceId;
    workspaceName = m.workspaceName;
    role = m.role;
    await db(region)
      .update(sessions)
      .set({ activeWorkspaceId: workspaceId })
      .where(eq(sessions.id, cookieValue));
  }

  return {
    user: {
      id: row.userId,
      email: row.email,
      username: row.username,
      region,
      workspaceId,
      workspaceName,
      role
    },
    sessionId: row.sessionId
  };
}

export async function logout(sessionId: string): Promise<void> {
  const colon = sessionId.indexOf(':');
  if (colon === -1) return;
  const region = sessionId.slice(0, colon);
  await db(region).delete(sessions).where(eq(sessions.id, sessionId));
}

export async function logoutOthers(userId: string, currentSessionId: string, region: string): Promise<void> {
  await db(region)
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)));
}

export async function purgeExpiredSessions(region?: string): Promise<void> {
  await db(region).delete(sessions).where(lt(sessions.expiresAt, Date.now()));
}

export async function requestPasswordReset(emailRaw: string): Promise<string | null> {
  const email = normalizeEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return null;
  const region = await lookupRegion(email);
  const user = await db(region).select().from(users).where(eq(users.email, email)).get();
  if (!user) return null;
  const token = `${region}:${createId()}${createId()}`;
  await db(region).insert(passwordResetTokens).values({
    token,
    userId: user.id,
    expiresAt: Date.now() + RESET_TTL_MS
  });
  return token;
}

export async function consumeResetToken(token: string, newPassword: string): Promise<void> {
  assertPassword(newPassword);
  const colon = token.indexOf(':');
  if (colon === -1) throw new AuthError('invalid_token');
  const region = token.slice(0, colon);

  const row = await db(region)
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .get();
  if (!row) throw new AuthError('invalid_token');
  if (row.usedAt) throw new AuthError('invalid_token');
  if (row.expiresAt < Date.now()) throw new AuthError('expired_token');

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db(region).update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db(region)
    .update(passwordResetTokens)
    .set({ usedAt: Date.now() })
    .where(eq(passwordResetTokens.token, token));
  // Invalidate all sessions for this user as a safety net.
  await db(region).delete(sessions).where(eq(sessions.userId, row.userId));
}

export async function updatePassword(userId: string, region: string, newPassword: string): Promise<void> {
  assertPassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db(region).update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function verifyPassword(userId: string, region: string, password: string): Promise<boolean> {
  const u = await db(region).select().from(users).where(eq(users.id, userId)).get();
  if (!u) return false;
  if (u.passwordHash === OAUTH_SENTINEL) return false;
  return bcrypt.compare(password, u.passwordHash);
}

export async function userHasPassword(userId: string, region: string): Promise<boolean> {
  const u = await db(region).select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).get();
  return !!u && u.passwordHash !== OAUTH_SENTINEL;
}

export async function isNewGoogleUser(emailRaw: string): Promise<boolean> {
  const email = normalizeEmail(emailRaw);
  const row = await primaryDb().select().from(emailRouting).where(eq(emailRouting.email, email)).get();
  return !row;
}

export async function registerWithGoogle(input: {
  googleId: string;
  email: string;
  username: string;
  region: string;
}): Promise<{ user: AuthUser; sessionId: string; expiresAt: number }> {
  const email = normalizeEmail(input.email);
  assertUsername(input.username);

  // Race-condition guard: if account appeared between the check and now, link it.
  const existing = await primaryDb().select().from(emailRouting).where(eq(emailRouting.email, email)).get();
  if (existing) {
    return loginOrRegisterWithGoogle({ googleId: input.googleId, email, name: input.username });
  }

  const username = input.username.trim().slice(0, 50);
  const region = input.region;
  const id = createId();
  const now = Date.now();

  await db(region).insert(users).values({ id, email, passwordHash: OAUTH_SENTINEL, username, createdAt: now });
  await primaryDb().insert(emailRouting).values({ email, region });
  await db(region).insert(oauthAccounts).values({
    id: createId(),
    userId: id,
    provider: 'google',
    providerUserId: input.googleId,
    email,
    createdAt: now
  });

  const workspaceName = `${username}'s workspace`;
  const workspaceId = await createWorkspace(region, id, workspaceName);

  const session = await createSession(id, region, workspaceId);
  return {
    user: { id, email, username, region, workspaceId, workspaceName, role: 'owner' },
    sessionId: session.id,
    expiresAt: session.expiresAt
  };
}

export async function loginOrRegisterWithGoogle(input: {
  googleId: string;
  email: string;
  name: string;
  region?: string;
}): Promise<{ user: AuthUser; sessionId: string; expiresAt: number }> {
  const email = normalizeEmail(input.email);

  const routing = await primaryDb().select().from(emailRouting).where(eq(emailRouting.email, email)).get();

  if (routing) {
    const region = routing.region;
    const user = await db(region).select().from(users).where(eq(users.email, email)).get();
    if (!user) throw new AuthError('not_found');

    // Link Google account if not already linked.
    const linked = await db(region)
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, input.googleId)))
      .get();
    if (!linked) {
      await db(region).insert(oauthAccounts).values({
        id: createId(),
        userId: user.id,
        provider: 'google',
        providerUserId: input.googleId,
        email,
        createdAt: Date.now()
      });
    }

    const m = await ensureWorkspace(region, user.id, `${user.username ?? 'My'} workspace`);
    const session = await createSession(user.id, region, m.workspaceId);
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        region,
        workspaceId: m.workspaceId,
        workspaceName: m.workspaceName,
        role: m.role
      },
      sessionId: session.id,
      expiresAt: session.expiresAt
    };
  }

  // New user.
  if (await isRegistrationDisabled()) {
    throw new AuthError('registration_disabled', 'Registration is disabled on this instance');
  }

  const region = input.region ?? defaultRegion();
  const id = createId();
  const now = Date.now();
  const username = input.name.trim().slice(0, 50) || 'user';

  await db(region).insert(users).values({ id, email, passwordHash: OAUTH_SENTINEL, username, createdAt: now });
  await primaryDb().insert(emailRouting).values({ email, region });
  await db(region).insert(oauthAccounts).values({
    id: createId(),
    userId: id,
    provider: 'google',
    providerUserId: input.googleId,
    email,
    createdAt: now
  });

  const workspaceName = `${username}'s workspace`;
  const workspaceId = await createWorkspace(region, id, workspaceName);

  const session = await createSession(id, region, workspaceId);
  return {
    user: { id, email, username, region, workspaceId, workspaceName, role: 'owner' },
    sessionId: session.id,
    expiresAt: session.expiresAt
  };
}

/**
 * Delete an account.
 *
 * This used to be four lines that leaned entirely on ON DELETE CASCADE. With
 * workspaces that is actively dangerous: some of the user's authored rows now
 * live in workspaces they do NOT own, and cascading the users row would delete
 * every person, company and interaction they ever created *in someone else's
 * workspace*. Silent, irreversible, cross-tenant data loss from a routine
 * self-service action.
 *
 * So: refuse up-front if they own a workspace that other people are still in,
 * then reassign their authored rows everywhere else, and only then delete.
 */
export async function deleteAccount(userId: string, region: string): Promise<void> {
  const user = await db(region).select().from(users).where(eq(users.id, userId)).get();
  if (!user) return;

  const memberships = await db(region)
    .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));

  // Check every workspace before writing anything, so a refusal leaves no
  // half-finished state behind.
  const owned: string[] = [];
  for (const m of memberships) {
    const ws = await getWorkspace(region, m.workspaceId);
    if (!ws || ws.ownerUserId !== userId) continue;
    if ((await countMembers(region, m.workspaceId)) > 1) {
      throw new AuthError(
        'owner_must_transfer',
        'Transfer ownership or remove the other members before deleting your account'
      );
    }
    owned.push(m.workspaceId);
  }

  for (const m of memberships) {
    if (owned.includes(m.workspaceId)) continue;
    const ws = await getWorkspace(region, m.workspaceId);
    if (!ws) continue;
    await reassignAuthorship(region, m.workspaceId, userId, ws.ownerUserId);
    await db(region)
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, m.workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      );
  }

  // Sole-owner workspaces go with the account, matching the pre-workspaces
  // behaviour. purgeWorkspace explains why this can't lean on a cascade, and
  // why deleting the user first fails too.
  for (const workspaceId of owned) {
    await purgeWorkspace(region, workspaceId);
  }

  // Cascades sessions, oauth_accounts and password_reset_tokens. Note it also
  // cascades invites this user sent into *other* people's workspaces
  // (invited_by_user_id ON DELETE CASCADE) — acceptable, but it means a
  // pending invite can vanish when its sender deletes their account.
  await db(region).delete(users).where(eq(users.id, userId));
  await primaryDb().delete(emailRouting).where(eq(emailRouting.email, user.email));
}

export async function updateUsername(userId: string, region: string, username: string | null): Promise<void> {
  await db(region)
    .update(users)
    .set({ username: username?.trim() || null })
    .where(eq(users.id, userId));
}

export async function updateEmail(userId: string, region: string, newEmailRaw: string): Promise<void> {
  const newEmail = normalizeEmail(newEmailRaw);
  assertEmail(newEmail);
  const conflict = await primaryDb()
    .select()
    .from(emailRouting)
    .where(eq(emailRouting.email, newEmail))
    .get();
  if (conflict) throw new AuthError('email_taken');
  const current = await db(region).select().from(users).where(eq(users.id, userId)).get();
  if (!current) throw new AuthError('not_found');
  await db(region).update(users).set({ email: newEmail }).where(eq(users.id, userId));
  await primaryDb().delete(emailRouting).where(eq(emailRouting.email, current.email));
  await primaryDb().insert(emailRouting).values({ email: newEmail, region });
}

export const SESSION_COOKIE = 'heli_session';
