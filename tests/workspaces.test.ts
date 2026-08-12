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
