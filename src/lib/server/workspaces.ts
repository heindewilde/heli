import { createId } from '@paralleldrive/cuid2';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { client, db } from './db';
import { TENANT_TABLES } from './migrate';
import { sessions, users, workspaces, workspaceMembers, type WorkspaceRole } from './schema';

export type Membership = {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

/**
 * Create a workspace and its owner membership.
 *
 * `id` defaults to the owner's user id. The migration backfill relies on that
 * (workspaces.id = users.id makes the column fill bijective and collision-free),
 * and new signups follow the same rule so the invariant is uniformly true rather
 * than "true only for accounts that predate workspaces" — the kind of half-truth
 * someone later writes a `WHERE workspace_id = user_id` against.
 */
export async function createWorkspace(
  region: string,
  ownerUserId: string,
  name: string,
  id: string = ownerUserId
): Promise<string> {
  const now = Date.now();
  await db(region)
    .insert(workspaces)
    .values({
      id,
      name: name.trim() || 'My workspace',
      region,
      ownerUserId,
      plan: 'free',
      seatLimit: null,
      createdAt: now,
      updatedAt: now
    });
  await db(region)
    .insert(workspaceMembers)
    .values({ workspaceId: id, userId: ownerUserId, role: 'owner', createdAt: now });
  return id;
}

export async function listMemberships(region: string, userId: string): Promise<Membership[]> {
  const rows = await db(region)
    .select({
      workspaceId: workspaceMembers.workspaceId,
      workspaceName: workspaces.name,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    // Own workspace first, then oldest membership. Order by the expression
    // rather than a select alias — SQLite can't resolve an alias here.
    .orderBy(desc(sql`(${workspaces.ownerUserId} = ${userId})`), asc(workspaceMembers.createdAt));
  return rows.map((r) => ({
    workspaceId: r.workspaceId,
    workspaceName: r.workspaceName,
    role: r.role as WorkspaceRole
  }));
}

/** Deterministic default: the user's own workspace first, then oldest membership. */
export async function pickWorkspace(region: string, userId: string): Promise<Membership | null> {
  const all = await listMemberships(region, userId);
  return all[0] ?? null;
}

export async function getMembership(
  region: string,
  workspaceId: string,
  userId: string
): Promise<Membership | null> {
  const row = await db(region)
    .select({
      workspaceId: workspaceMembers.workspaceId,
      workspaceName: workspaces.name,
      role: workspaceMembers.role
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .get();
  return row ? { ...row, role: row.role as WorkspaceRole } : null;
}

/**
 * Safety net for any account that somehow has no workspace — a half-applied
 * migration, or a user row created outside `register`. Cheap: one indexed read
 * on the happy path.
 */
export async function ensureWorkspace(
  region: string,
  userId: string,
  fallbackName: string
): Promise<Membership> {
  const existing = await pickWorkspace(region, userId);
  if (existing) return existing;
  // The user's own id may already be taken as a workspace id in exotic cases
  // (e.g. a restored backup), so fall back to a fresh id rather than colliding.
  const taken = await db(region).select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, userId)).get();
  const id = taken ? createId() : userId;
  await createWorkspace(region, userId, fallbackName, id);
  return { workspaceId: id, workspaceName: fallbackName, role: 'owner' };
}

export async function countMembers(region: string, workspaceId: string): Promise<number> {
  const row = await db(region)
    .select({ n: sql<number>`COUNT(*)` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .get();
  return Number(row?.n ?? 0);
}

/**
 * Hand every row a user created in this workspace to the workspace owner.
 *
 * This is what lets `user_id` keep its ON DELETE CASCADE without a departing
 * member's records being vaporised: nothing ever deletes a user row while it
 * still owns workspace content. Must run before the membership row goes away.
 *
 * Note this is exactly why the old per-user unique indexes had to be dropped —
 * the owner may already hold a row with the same url/slug/name in a *different*
 * workspace, and uq_people_user_url would have rejected the reassignment.
 */
export async function reassignAuthorship(
  region: string,
  workspaceId: string,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  const c = client(region);
  for (const table of TENANT_TABLES) {
    await c.execute({
      sql: `UPDATE ${table} SET user_id = ? WHERE workspace_id = ? AND user_id = ?`,
      args: [toUserId, workspaceId, fromUserId]
    });
  }
}

export async function getWorkspace(region: string, workspaceId: string) {
  return db(region).select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
}

/**
 * Remove someone from a workspace. Their authored rows stay, reattributed to
 * the owner. Their sessions for this workspace stop validating on the next
 * request — validateSession's join to workspace_members is the revocation
 * mechanism — and get moved to another workspace they belong to.
 */
export async function removeMember(
  region: string,
  workspaceId: string,
  targetUserId: string
): Promise<void> {
  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new Error('workspace_not_found');
  if (ws.ownerUserId === targetUserId) throw new Error('cannot_remove_owner');

  await reassignAuthorship(region, workspaceId, targetUserId, ws.ownerUserId);
  await db(region)
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))
    );
  // Belt and braces: the membership join already fails without this.
  await db(region)
    .update(sessions)
    .set({ activeWorkspaceId: null })
    .where(
      and(eq(sessions.userId, targetUserId), eq(sessions.activeWorkspaceId, workspaceId))
    );
}

export async function setMemberRole(
  region: string,
  workspaceId: string,
  targetUserId: string,
  role: WorkspaceRole
): Promise<void> {
  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new Error('workspace_not_found');
  if (ws.ownerUserId === targetUserId) throw new Error('cannot_change_owner_role');
  await db(region)
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))
    );
}

export async function transferOwnership(
  region: string,
  workspaceId: string,
  newOwnerUserId: string
): Promise<void> {
  const m = await getMembership(region, workspaceId, newOwnerUserId);
  if (!m) throw new Error('not_a_member');
  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new Error('workspace_not_found');
  await db(region)
    .update(workspaces)
    .set({ ownerUserId: newOwnerUserId, updatedAt: Date.now() })
    .where(eq(workspaces.id, workspaceId));
  await db(region)
    .update(workspaceMembers)
    .set({ role: 'owner' })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, newOwnerUserId)
      )
    );
  // The previous owner stays on as an admin rather than being dropped.
  await db(region)
    .update(workspaceMembers)
    .set({ role: 'admin' })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, ws.ownerUserId)
      )
    );
}

export type MemberRow = {
  userId: string;
  email: string;
  username: string | null;
  role: WorkspaceRole;
  joinedAt: number;
  isOwner: boolean;
};

export async function listMembers(region: string, workspaceId: string): Promise<MemberRow[]> {
  const ws = await getWorkspace(region, workspaceId);
  const rows = await db(region)
    .select({
      userId: workspaceMembers.userId,
      email: users.email,
      username: users.username,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));
  return rows.map((r) => ({
    ...r,
    role: r.role as WorkspaceRole,
    isOwner: r.userId === ws?.ownerUserId
  }));
}

/** NULL seat_limit means unlimited — the self-host default. */
export async function hasSeatAvailable(region: string, workspaceId: string): Promise<boolean> {
  const ws = await db(region)
    .select({ seatLimit: workspaces.seatLimit })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (!ws || ws.seatLimit == null) return true;
  return (await countMembers(region, workspaceId)) < ws.seatLimit;
}
