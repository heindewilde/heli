import { createId } from '@paralleldrive/cuid2';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { client, db } from './db';
import { ASSIGNMENT_COLUMNS, PERSONAL_TABLES, ROW_PERSONAL, TENANT_TABLES } from './migrate';
import { sanitizePlainText } from './sanitize';
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
  // Batched: a workspace row without its owner membership is unreachable — the
  // owner can't see it, can't switch to it, and can't delete it. Harmless when
  // this only ran at signup; not once users can create workspaces on demand.
  await client(region).batch(
    [
      {
        sql: `INSERT INTO workspaces (id, name, region, owner_user_id, plan, seat_limit, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'free', NULL, ?, ?)`,
        args: [
          id,
          sanitizePlainText(name, WORKSPACE_NAME_MAX) || 'My workspace',
          region,
          ownerUserId,
          now,
          now
        ]
      },
      {
        sql: `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
              VALUES (?, ?, 'owner', ?)`,
        args: [id, ownerUserId, now]
      }
    ],
    'write'
  );
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
 *
 * PERSONAL_TABLES are the exception: their user_id is a real owner, not
 * attribution, so those rows are deleted rather than handed over. Reassigning a
 * reminder would put someone's private follow-ups in the owner's sidebar.
 *
 * ROW_PERSONAL is the third case, where the two apply to different rows of the
 * same table: an outreach template that was shared is workspace property, one
 * marked private was deliberately not. Those tables get both statements, and
 * the DELETE must come first — run the other way round, the rows it targets
 * have already been reassigned and no longer match `user_id = fromUserId`.
 */
export async function reassignAuthorship(
  region: string,
  workspaceId: string,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  const c = client(region);
  for (const table of TENANT_TABLES) {
    const wholeTableIsPersonal = PERSONAL_TABLES.includes(table);
    // A constant predicate from ROW_PERSONAL, never user input.
    const rowPredicate = ROW_PERSONAL[table];

    if (wholeTableIsPersonal || rowPredicate) {
      await c.execute({
        sql:
          `DELETE FROM ${table} WHERE workspace_id = ? AND user_id = ?` +
          (rowPredicate ? ` AND (${rowPredicate})` : ''),
        args: [workspaceId, fromUserId]
      });
      if (wholeTableIsPersonal) continue;
    }

    await c.execute({
      sql: `UPDATE ${table} SET user_id = ? WHERE workspace_id = ? AND user_id = ?`,
      args: [toUserId, workspaceId, fromUserId]
    });
  }

  // Rows that book the departing member's *time* rather than record their
  // authorship. The loop above cannot express this: on project_allocations
  // `user_id` is attribution and is correctly reassigned, while
  // `assignee_user_id` names whose week is committed. Handing that over would
  // book the workspace owner for work that left with the member, and keep it
  // showing on /availability. Column names come from a constant map.
  for (const [table, column] of Object.entries(ASSIGNMENT_COLUMNS)) {
    await c.execute({
      sql: `DELETE FROM ${table} WHERE workspace_id = ? AND ${column} = ?`,
      args: [workspaceId, fromUserId]
    });
  }
}

/**
 * Delete a workspace and everything in it.
 *
 * There is no cascade to lean on: `workspace_id` was added by ALTER as a plain
 * `REFERENCES workspaces(id)` with no ON DELETE, so with `PRAGMA foreign_keys =
 * ON` a bare `DELETE FROM workspaces` fails the moment the workspace holds a
 * single row. The contents go first, in one batch, so a failure can't leave a
 * half-emptied tenant. `workspace_members` and `workspace_invites` *do* cascade
 * (see the DDL) and are not listed here.
 */
export async function purgeWorkspace(region: string, workspaceId: string): Promise<void> {
  await client(region).batch(
    [
      ...TENANT_TABLES.map((table) => ({
        sql: `DELETE FROM ${table} WHERE workspace_id = ?`,
        args: [workspaceId]
      })),
      { sql: `DELETE FROM workspaces WHERE id = ?`, args: [workspaceId] }
    ],
    'write'
  );
}

/**
 * Owner-only, last-member-only workspace deletion.
 *
 * Requiring sole membership is what keeps this from being a way to destroy
 * colleagues' work: hand the workspace over or remove people first, which are
 * both deliberate acts with their own confirmations.
 */
export async function deleteWorkspace(
  region: string,
  workspaceId: string,
  actingUserId: string
): Promise<void> {
  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new Error('workspace_not_found');
  if (ws.ownerUserId !== actingUserId) throw new Error('not_owner');
  if ((await countMembers(region, workspaceId)) > 1) throw new Error('workspace_has_members');
  await purgeWorkspace(region, workspaceId);
}

export const WORKSPACE_NAME_MAX = 80;

/** How many workspaces one account may own. A durable backstop to the rate limit. */
export const MAX_OWNED_WORKSPACES = 10;

export async function renameWorkspace(
  region: string,
  workspaceId: string,
  name: string
): Promise<string> {
  const clean = sanitizePlainText(name, WORKSPACE_NAME_MAX);
  if (!clean) throw new Error('invalid_name');
  await db(region)
    .update(workspaces)
    .set({ name: clean, updatedAt: Date.now() })
    .where(eq(workspaces.id, workspaceId));
  return clean;
}

export async function countOwnedWorkspaces(region: string, userId: string): Promise<number> {
  const row = await db(region)
    .select({ n: sql<number>`COUNT(*)` })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .get();
  return Number(row?.n ?? 0);
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

/**
 * Hand a workspace to another member. The outgoing owner stays on as an admin
 * rather than being dropped.
 *
 * `actingUserId` is checked against `workspaces.owner_user_id` rather than
 * relying on the caller's `Scope.role`: role lives in workspace_members, which
 * is exactly the column that can drift from owner_user_id, and the workspaces
 * row is the source of truth for who may hand the place over.
 *
 * Self-transfer is rejected because it is unrecoverable, not merely useless:
 * the promote-then-demote pair would leave the workspace with *no* member
 * holding the owner role while owner_user_id still names them — at which point
 * requireRole(s,'owner') fails for everyone, so it can never be transferred
 * again, removeMember still refuses to remove them, and deleteAccount still
 * counts the workspace as owned. A permanent lockout.
 */
export async function transferOwnership(
  region: string,
  workspaceId: string,
  actingUserId: string,
  newOwnerUserId: string
): Promise<void> {
  const ws = await getWorkspace(region, workspaceId);
  if (!ws) throw new Error('workspace_not_found');
  if (ws.ownerUserId !== actingUserId) throw new Error('not_owner');
  if (ws.ownerUserId === newOwnerUserId) throw new Error('already_owner');
  const m = await getMembership(region, workspaceId, newOwnerUserId);
  if (!m) throw new Error('not_a_member');

  // One batch: a partial application would leave owner_user_id disagreeing with
  // the owner-role row, which is the divergence every guard above assumes away.
  await client(region).batch(
    [
      {
        sql: `UPDATE workspaces SET owner_user_id = ?, updated_at = ? WHERE id = ?`,
        args: [newOwnerUserId, Date.now(), workspaceId]
      },
      {
        sql: `UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND user_id = ?`,
        args: [workspaceId, newOwnerUserId]
      },
      {
        sql: `UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND user_id = ?`,
        args: [workspaceId, ws.ownerUserId]
      }
    ],
    'write'
  );
}

export type MemberRow = {
  userId: string;
  email: string;
  username: string | null;
  role: WorkspaceRole;
  joinedAt: number;
  isOwner: boolean;
  /** Sellable minutes a week. NULL means the member is on the default. */
  weeklyCapacityMinutes: number | null;
};

export async function listMembers(region: string, workspaceId: string): Promise<MemberRow[]> {
  const ws = await getWorkspace(region, workspaceId);
  const rows = await db(region)
    .select({
      userId: workspaceMembers.userId,
      email: users.email,
      username: users.username,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
      weeklyCapacityMinutes: workspaceMembers.weeklyCapacityMinutes
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
