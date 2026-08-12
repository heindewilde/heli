import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, scopeFor, type Tenant } from './helpers/fixtures';

/**
 * `reassignAuthorship` shipped a data-leak bug once: it handed a departing
 * member's private reminders to the workspace owner, because those rows carry
 * a workspace_id like everything else. The PERSONAL_TABLES carve-out is the
 * fix, and this is the test that keeps it.
 */

let ctx: TestDb;
let owner: Tenant;
let leaver: Tenant;
let leaverScope: ReturnType<typeof scopeFor>;

let leaverPersonId: string;
let leaverReminderId: string;
let ownerReminderId: string;
/** Both authored by the leaver; they differ only in whose time they book. */
let allocOnLeaverId: string;
let allocOnOwnerId: string;
/** A finished entry is billing history; a running one is live UI state. */
let leaverFinishedEntryId: string;
let leaverRunningEntryId: string;

beforeAll(async () => {
  ctx = await freshDb();
  owner = await makeTenant('owner');
  leaver = await makeTenant('leaver');

  const { db } = await import('../src/lib/server/db');
  const { workspaceMembers, reminders } = await import('../src/lib/server/schema');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { createId } = await import('@paralleldrive/cuid2');

  // Put the leaver into the owner's workspace as a member.
  leaverScope = await joinWorkspace(owner, leaver);

  // Shared CRM work, authored by the leaver.
  const person = await savePerson(leaverScope, null, { name: 'Grace Hopper' });
  leaverPersonId = person.id;

  // A private reminder each.
  const now = Date.now();
  leaverReminderId = createId();
  ownerReminderId = createId();
  await db(owner.scope.region).insert(reminders).values([
    {
      id: leaverReminderId,
      workspaceId: owner.scope.workspaceId,
      userId: leaver.user.id,
      kind: 'person',
      refId: person.id,
      remindAt: now + 86_400_000,
      createdAt: now
    },
    {
      id: ownerReminderId,
      workspaceId: owner.scope.workspaceId,
      userId: owner.user.id,
      kind: 'person',
      refId: person.id,
      remindAt: now + 86_400_000,
      createdAt: now
    }
  ]);

  // Two allocations, both *authored* by the leaver so the attribution rewrite
  // and the assignment deletion can be told apart.
  const { createProject } = await import('../src/lib/server/saveProject');
  const { createAllocation } = await import('../src/lib/server/allocations');
  const project = await createProject(leaverScope, { name: 'Shared engagement' });
  allocOnLeaverId = (
    await createAllocation(leaverScope, project.id, {
      assigneeUserId: leaver.user.id,
      startDate: now,
      endDate: now + 90 * 86_400_000,
      minutesPerWeek: 1440
    })
  ).id;
  allocOnOwnerId = (
    await createAllocation(leaverScope, project.id, {
      assigneeUserId: owner.user.id,
      startDate: now,
      endDate: now + 90 * 86_400_000,
      minutesPerWeek: 600
    })
  ).id;

  const { createEntry, startTimer } = await import('../src/lib/server/time');
  leaverFinishedEntryId = (
    await createEntry(leaverScope, { startedAt: now - 3 * 3_600_000, minutes: 120 })
  ).id;
  leaverRunningEntryId = (await startTimer(leaverScope)).entry.id;
}, 120_000);

afterAll(() => ctx?.cleanup());

test('PERSONAL_TABLES is a subset of TENANT_TABLES', async () => {
  const { TENANT_TABLES, PERSONAL_TABLES } = await import('../src/lib/server/migrate');
  for (const t of PERSONAL_TABLES) {
    expect(TENANT_TABLES as readonly string[]).toContain(t);
  }
});

test('reassignAuthorship hands over shared work but deletes personal rows', async () => {
  const { reassignAuthorship } = await import('../src/lib/server/workspaces');
  const { listReminders } = await import('../src/lib/server/reminders-query');

  await reassignAuthorship(
    owner.scope.region,
    owner.scope.workspaceId,
    leaver.user.id,
    owner.user.id
  );

  // Shared: the person survives, now attributed to the owner.
  const row = await ctx.client.execute({
    sql: `SELECT user_id FROM people WHERE id = ?`,
    args: [leaverPersonId]
  });
  expect(row.rows).toHaveLength(1);
  expect(String(row.rows[0].user_id)).toBe(owner.user.id);

  // Personal: the leaver's reminder is gone, NOT moved to the owner.
  const remaining = await ctx.client.execute({
    sql: `SELECT id, user_id FROM reminders WHERE workspace_id = ?`,
    args: [owner.scope.workspaceId]
  });
  const ids = remaining.rows.map((r) => String(r.id));
  expect(ids).not.toContain(leaverReminderId);
  expect(ids).toContain(ownerReminderId);

  // And the owner's sidebar shows exactly one reminder — their own.
  const hers = await listReminders(owner.scope);
  expect(hers.map((r) => r.id)).toEqual([ownerReminderId]);

  // Allocations split by *which* user column matters. The one booking the
  // leaver's own time is deleted: keeping it would book the owner for 24 hours
  // a week of work that walked out of the door, and it would keep showing on
  // /availability. The one booking the owner survives, with its authorship
  // rewritten like any other shared record.
  const allocs = await ctx.client.execute({
    sql: `SELECT id, user_id, assignee_user_id FROM project_allocations WHERE workspace_id = ?`,
    args: [owner.scope.workspaceId]
  });
  const allocIds = allocs.rows.map((r) => String(r.id));
  expect(allocIds).not.toContain(allocOnLeaverId);
  expect(allocIds).toEqual([allocOnOwnerId]);
  expect(String(allocs.rows[0].user_id)).toBe(owner.user.id);
  expect(String(allocs.rows[0].assignee_user_id)).toBe(owner.user.id);

  // Time splits the other way, by ROW_PERSONAL: a *finished* entry is billing
  // history and must survive, reassigned like any shared record. A *running*
  // one is live UI state belonging to someone who has gone — keeping it would
  // leave the owner with a clock ticking on a job they never started, and it
  // would occupy their one running-timer slot.
  const entries = await ctx.client.execute({
    sql: `SELECT id, user_id, ended_at FROM time_entries WHERE workspace_id = ?`,
    args: [owner.scope.workspaceId]
  });
  const entryIds = entries.rows.map((r) => String(r.id));
  expect(entryIds).toContain(leaverFinishedEntryId);
  expect(entryIds).not.toContain(leaverRunningEntryId);
  const kept = entries.rows.find((r) => String(r.id) === leaverFinishedEntryId)!;
  expect(String(kept.user_id)).toBe(owner.user.id);

  // The owner can therefore still start their own timer.
  const { startTimer, stopTimer } = await import('../src/lib/server/time');
  const started = await startTimer(owner.scope);
  expect(started.alreadyRunning).toBe(false);
  await stopTimer(owner.scope);
});

test('ASSIGNMENT_COLUMNS names real tenant tables', async () => {
  const { TENANT_TABLES, ASSIGNMENT_COLUMNS, PERSONAL_TABLES } = await import(
    '../src/lib/server/migrate'
  );
  for (const table of Object.keys(ASSIGNMENT_COLUMNS)) {
    // It has to be in the loop reassignAuthorship walks, or the DELETE would
    // be the only thing that ever touched the table.
    expect(TENANT_TABLES as readonly string[]).toContain(table);
    // And it must not be wholly personal, or the row would already be gone.
    expect(PERSONAL_TABLES).not.toContain(table);
  }
});

test('purgeWorkspace empties every tenant table before dropping the workspace', async () => {
  const { purgeWorkspace } = await import('../src/lib/server/workspaces');
  const { TENANT_TABLES } = await import('../src/lib/server/migrate');

  // A bare DELETE FROM workspaces would fail the FK here — the workspace still
  // holds rows. This is the assertion that the ordering is right.
  await purgeWorkspace(owner.scope.region, owner.scope.workspaceId);

  for (const table of TENANT_TABLES) {
    const res = await ctx.client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id = ?`,
      args: [owner.scope.workspaceId]
    });
    expect({ table, n: Number(res.rows[0].n) }).toEqual({ table, n: 0 });
  }

  const ws = await ctx.client.execute({
    sql: `SELECT id FROM workspaces WHERE id = ?`,
    args: [owner.scope.workspaceId]
  });
  expect(ws.rows).toHaveLength(0);

  // The leaver's own workspace is untouched.
  const other = await ctx.client.execute({
    sql: `SELECT id FROM workspaces WHERE id = ?`,
    args: [leaver.scope.workspaceId]
  });
  expect(other.rows).toHaveLength(1);
});
