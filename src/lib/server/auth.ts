import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcryptjs';
import { and, eq, lt, ne } from 'drizzle-orm';
import { db, primaryDb, defaultRegion } from './db';
import { users, sessions, passwordResetTokens, emailRouting } from './schema';

const BCRYPT_ROUNDS = 10;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  region: string;
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

export async function userCount(region?: string): Promise<number> {
  const rows = await db(region).select({ id: users.id }).from(users).limit(2);
  return rows.length;
}

export async function isFirstUser(): Promise<boolean> {
  return (await userCount()) === 0;
}

async function lookupRegion(email: string): Promise<string> {
  const row = await primaryDb()
    .select()
    .from(emailRouting)
    .where(eq(emailRouting.email, email))
    .get();
  return row?.region ?? defaultRegion();
}

async function createSession(userId: string, region: string): Promise<{ id: string; expiresAt: number }> {
  const id = `${region}:${createId()}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db(region).insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function register(input: {
  email: string;
  password: string;
  username?: string | null;
  region?: string;
}): Promise<{ user: AuthUser; sessionId: string; expiresAt: number }> {
  const email = normalizeEmail(input.email);
  assertEmail(email);
  assertPassword(input.password);
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
  const username = input.username?.trim() || null;

  await db(region).insert(users).values({
    id,
    email,
    passwordHash,
    username,
    createdAt: now
  });
  await primaryDb().insert(emailRouting).values({ email, region });

  const session = await createSession(id, region);
  return {
    user: { id, email, username, region },
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

  const session = await createSession(user.id, region);
  return {
    user: { id: user.id, email: user.email, username: user.username, region },
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

  const session = await db(region).select().from(sessions).where(eq(sessions.id, cookieValue)).get();
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await db(region).delete(sessions).where(eq(sessions.id, cookieValue));
    return null;
  }

  const user = await db(region).select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    await db(region).delete(sessions).where(eq(sessions.id, cookieValue));
    return null;
  }

  return {
    user: { id: user.id, email: user.email, username: user.username, region },
    sessionId: session.id
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

export const SESSION_COOKIE = 'gusto_session';
