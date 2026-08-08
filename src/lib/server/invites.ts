import { createId } from '@paralleldrive/cuid2';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { db, primaryDb } from './db';
import { emailRouting, users, workspaceInvites, workspaceMembers, type WorkspaceRole } from './schema';
import { getWorkspace, hasSeatAvailable } from './workspaces';
import { escapeHtml, isEmailConfigured, sendEmail } from './email';
import { APP_NAME } from '$lib/branding';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class InviteError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type PendingInvite = {
  token: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: number;
  createdAt: number;
  url: string;
};

function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/invite/${token}`;
}

/**
 * Create an invite.
 *
 * The link is the product; email is an optional delivery mechanism. The row is
 * committed and the URL returned before we even look at email, so a self-host
 * with no RESEND_API_KEY can still invite people by copying the link — the same
 * way password reset already degrades to a server log. Don't branch the UI on
 * whether email is configured; that's how the self-host path rots.
 */
export async function createInvite(
  region: string,
  workspaceId: string,
  invitedByUserId: string,
  origin: string,
  input: { email: string; role: WorkspaceRole }
): Promise<{ invite: PendingInvite; emailed: boolean }> {
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InviteError('invalid_email');

  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new InviteError('workspace_not_found');

  // Already a member?
  const existingUser = await db(region).select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existingUser) {
    const m = await db(region)
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, existingUser.id)
        )
      )
      .get();
    if (m) throw new InviteError('already_member');
  }

  if (!(await hasSeatAvailable(region, workspaceId))) throw new InviteError('seat_limit_reached');

  // A workspace lives in exactly one region, so an existing account whose data
  // sits in another region cannot join — that would mean moving their rows
  // between databases. Fail here rather than at acceptance, so the inviter finds
  // out immediately instead of the invitee hitting a dead end.
  const routing = await primaryDb()
    .select({ region: emailRouting.region })
    .from(emailRouting)
    .where(eq(emailRouting.email, email))
    .get();
  if (routing && routing.region !== ws.region) {
    throw new InviteError('region_mismatch');
  }

  // Reclaim an expired invite for this address before trying to insert.
  //
  // uq_workspace_invites_pending is partial on `accepted_at IS NULL AND
  // revoked_at IS NULL`; expiry can't be in that predicate because a SQLite
  // partial index has no notion of "now". So an expired invite keeps occupying
  // the slot — and `listPendingInvites` filters it out of the UI, so there's no
  // Revoke button to free it either. Without this the address is un-invitable
  // forever once its first invite ages out.
  const now = Date.now();
  await db(region)
    .update(workspaceInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.email, email),
        isNull(workspaceInvites.acceptedAt),
        isNull(workspaceInvites.revokedAt),
        lt(workspaceInvites.expiresAt, now)
      )
    );

  const token = `${region}:${createId()}${createId()}`;
  const expiresAt = now + INVITE_TTL_MS;
  try {
    await db(region).insert(workspaceInvites).values({
      token,
      workspaceId,
      email,
      role: input.role,
      invitedByUserId,
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now
    });
  } catch (err) {
    // uq_workspace_invites_pending is partial — one live invite per address.
    if (/UNIQUE/i.test((err as Error).message ?? '')) throw new InviteError('already_invited');
    throw err;
  }

  const url = inviteUrl(origin, token);
  let emailed = false;
  if (isEmailConfigured()) {
    try {
      // The workspace name is user-supplied, so it must be escaped before it
      // goes into HTML. The subject and the text part are plain text and take
      // the raw value.
      const safeName = escapeHtml(ws.name);
      await sendEmail({
        to: email,
        subject: `You've been invited to ${ws.name} on ${APP_NAME}`,
        html: `<p>You've been invited to join <strong>${safeName}</strong> on ${APP_NAME}.</p>
               <p><a href="${url}">Accept the invitation</a></p>
               <p>This link expires in 7 days.</p>`,
        text: `You've been invited to join ${ws.name} on ${APP_NAME}.\n\nAccept: ${url}\n\nThis link expires in 7 days.`
      });
      emailed = true;
    } catch {
      // The row is committed and the link works — a mail failure must not 500.
      emailed = false;
    }
  }

  return {
    invite: { token, email, role: input.role, expiresAt, createdAt: now, url },
    emailed
  };
}

export async function listPendingInvites(
  region: string,
  workspaceId: string,
  origin: string
): Promise<PendingInvite[]> {
  const rows = await db(region)
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt),
        isNull(workspaceInvites.revokedAt)
      )
    )
    .orderBy(desc(workspaceInvites.createdAt));
  return rows
    .filter((r) => r.expiresAt > Date.now())
    .map((r) => ({
      token: r.token,
      email: r.email,
      role: r.role as WorkspaceRole,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      url: inviteUrl(origin, r.token)
    }));
}

export async function revokeInvite(
  region: string,
  workspaceId: string,
  token: string
): Promise<void> {
  await db(region)
    .update(workspaceInvites)
    .set({ revokedAt: Date.now() })
    .where(
      and(eq(workspaceInvites.token, token), eq(workspaceInvites.workspaceId, workspaceId))
    );
}

export type InviteDetails = {
  token: string;
  email: string;
  role: WorkspaceRole;
  workspaceId: string;
  workspaceName: string;
  region: string;
  /** True when no account exists for the invited address yet. */
  needsSignup: boolean;
};

/**
 * Resolve a token without consuming it. The region is carried in the token
 * prefix — same trick as session cookies and reset tokens — so this hits the
 * right regional DB with no primary lookup.
 */
export async function getInvite(token: string): Promise<InviteDetails | null> {
  const colon = token.indexOf(':');
  if (colon === -1) return null;
  const region = token.slice(0, colon);
  if (!region) return null;

  const row = await db(region)
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .get();
  if (!row) return null;
  if (row.acceptedAt || row.revokedAt || row.expiresAt < Date.now()) return null;

  const ws = await getWorkspace(region, row.workspaceId);
  if (!ws) return null;

  const routing = await primaryDb()
    .select({ region: emailRouting.region })
    .from(emailRouting)
    .where(eq(emailRouting.email, row.email))
    .get();

  return {
    token,
    email: row.email,
    role: row.role as WorkspaceRole,
    workspaceId: row.workspaceId,
    workspaceName: ws.name,
    region,
    needsSignup: !routing
  };
}

/** Join the workspace. The caller must already be signed in as the invited address. */
export async function acceptInvite(token: string, userId: string, userEmail: string): Promise<InviteDetails> {
  const invite = await getInvite(token);
  if (!invite) throw new InviteError('invite_invalid');
  if (normalizeEmail(userEmail) !== invite.email) throw new InviteError('wrong_account');
  if (!(await hasSeatAvailable(invite.region, invite.workspaceId))) {
    throw new InviteError('seat_limit_reached');
  }

  await db(invite.region)
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
      createdAt: Date.now()
    })
    .onConflictDoNothing();
  await db(invite.region)
    .update(workspaceInvites)
    .set({ acceptedAt: Date.now() })
    .where(eq(workspaceInvites.token, token));
  return invite;
}
