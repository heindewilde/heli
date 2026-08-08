import { createId } from '@paralleldrive/cuid2';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { workspaces, workspaceMembers, type WorkspaceRole } from './schema';

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
      isOwn: sql<number>`(${workspaces.ownerUserId} = ${userId})`,
      joinedAt: workspaceMembers.createdAt
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(sql`isOwn`), asc(workspaceMembers.createdAt));
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
