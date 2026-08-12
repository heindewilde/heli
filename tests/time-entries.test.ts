/**
 * Time tracking.
 *
 * The properties worth pinning: the partial unique index really does allow only
 * one running timer, the rate is a snapshot that survives a later price change,
 * ownership is enforced on edits, and the summary excludes work that has not
 * finished.
 */
import { beforeAll, afterAll, expect, test, describe } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, joinWorkspace, type Tenant } from './helpers/fixtures';
import type { Scope } from '../src/lib/server/scope';

let ctx: TestDb;
let alice: Tenant; // owner
let bob: Tenant; // member
let bobIn: Scope;
let adminScope: Scope;
let admin: Tenant;

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.parse('2026-03-02T09:00:00Z');

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  admin = await makeTenant('admin');
  bobIn = await joinWorkspace(alice, bob, 'member');
  adminScope = await joinWorkspace(alice, admin, 'admin');
}, 120_000);

afterAll(() => ctx?.cleanup());

async function hourlyProject(name: string, rateCents: number, currency = 'EUR') {
  const { createProject } = await import('../src/lib/server/saveProject');
  return (
    await createProject(alice.scope, {
      name,
      billingType: 'hourly',
      hourlyRate: rateCents,
      currency
    })
  ).id;
}

/** Leaves no running timer behind, so tests stay independent. */
async function clearTimers(...scopes: Scope[]) {
  const { stopTimer } = await import('../src/lib/server/time');
  for (const s of scopes) await stopTimer(s);
}

describe('the running timer', () => {
  test('starts, is readable, and stops with a duration', async () => {
    const t = await import('../src/lib/server/time');
    const { entry, alreadyRunning } = await t.startTimer(alice.scope, { description: 'Thinking' });
    expect(alreadyRunning).toBe(false);
    expect(entry.endedAt).toBeNull();

    const running = await t.getRunningEntry(alice.scope);
    expect(running?.id).toBe(entry.id);
    expect(running?.description).toBe('Thinking');

    const stopped = await t.stopTimer(alice.scope);
    expect(stopped?.id).toBe(entry.id);
    expect(stopped?.endedAt).not.toBeNull();
    expect(stopped!.endedAt! - stopped!.startedAt).toBeGreaterThanOrEqual(0);

    expect(await t.getRunningEntry(alice.scope)).toBeNull();
  });

  test('a second start returns the one already running rather than making two', async () => {
    const t = await import('../src/lib/server/time');
    const first = await t.startTimer(alice.scope);
    const second = await t.startTimer(alice.scope, { description: 'different' });

    expect(second.alreadyRunning).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);

    // And the index really is what stopped it: exactly one open row.
    const open = await ctx.client.execute({
      sql: `SELECT COUNT(*) AS n FROM time_entries WHERE workspace_id = ? AND user_id = ? AND ended_at IS NULL`,
      args: [alice.scope.workspaceId, alice.user.id]
    });
    expect(Number(open.rows[0].n)).toBe(1);

    await clearTimers(alice.scope);
  });

  test('two people can each have their own timer running', async () => {
    const t = await import('../src/lib/server/time');
    await t.startTimer(alice.scope);
    await t.startTimer(bobIn);

    expect(await t.getRunningEntry(alice.scope)).not.toBeNull();
    expect(await t.getRunningEntry(bobIn)).not.toBeNull();
    expect((await t.getRunningEntry(alice.scope))!.id).not.toBe(
      (await t.getRunningEntry(bobIn))!.id
    );

    await clearTimers(alice.scope, bobIn);
  });

  test('stopping with nothing running is a no-op', async () => {
    const t = await import('../src/lib/server/time');
    expect(await t.stopTimer(alice.scope)).toBeNull();
  });
});

describe('manual entries', () => {
  test('minutes and an explicit end are two ways to say the same thing', async () => {
    const t = await import('../src/lib/server/time');
    const a = await t.createEntry(alice.scope, { startedAt: T0, minutes: 90 });
    const b = await t.createEntry(alice.scope, { startedAt: T0, endedAt: T0 + 90 * MIN });

    const rows = await t.listTimeEntries(alice.scope, { from: T0, to: T0 + HOUR });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.id)!.endedAt! - T0).toBe(90 * MIN);
    expect(byId.get(b.id)!.endedAt! - T0).toBe(90 * MIN);

    await t.deleteEntry(alice.scope, a.id);
    await t.deleteEntry(alice.scope, b.id);
  });

  test('rejects a backwards or absurd range', async () => {
    const t = await import('../src/lib/server/time');
    await expect(
      t.createEntry(alice.scope, { startedAt: T0, endedAt: T0 - HOUR })
    ).rejects.toThrow('invalid_range');
    await expect(t.createEntry(alice.scope, { startedAt: T0, minutes: 0 })).rejects.toThrow(
      'invalid_minutes'
    );
    // Longer than a day is a forgotten timer, not a day's work.
    await expect(
      t.createEntry(alice.scope, { startedAt: T0, minutes: 25 * 60 })
    ).rejects.toThrow('too_long');
    await expect(t.createEntry(alice.scope, { startedAt: T0 })).rejects.toThrow('missing_duration');
  });

  test('a project from another workspace is not found', async () => {
    const t = await import('../src/lib/server/time');
    const stranger = await makeTenant('stranger-time');
    const { createProject } = await import('../src/lib/server/saveProject');
    const theirs = (await createProject(stranger.scope, { name: 'Theirs' })).id;
    await expect(
      t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: theirs })
    ).rejects.toThrow('not_found');
  });

  test('a milestone must belong to the project it is filed under', async () => {
    const t = await import('../src/lib/server/time');
    const { createProject } = await import('../src/lib/server/saveProject');
    const plan = await import('../src/lib/server/project-plan');
    const p1 = (await createProject(alice.scope, { name: 'One' })).id;
    const p2 = (await createProject(alice.scope, { name: 'Two' })).id;
    const m = await plan.createMilestone(alice.scope, p2, { title: 'Belongs to Two' });

    await expect(
      t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: p1, milestoneId: m.id })
    ).rejects.toThrow('milestone_not_in_project');
  });
});

describe('rate snapshots', () => {
  test('an hourly project makes time billable and stamps its rate', async () => {
    const t = await import('../src/lib/server/time');
    const pid = await hourlyProject('Rate test', 20_000, 'EUR');
    const { id } = await t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: pid });

    const [row] = await t.listTimeEntries(alice.scope, { projectId: pid });
    expect(row).toMatchObject({ billable: true, hourlyRate: 20_000, currency: 'EUR' });
    expect(row.id).toBe(id);
  });

  test('an allocation rate overrides the project rate', async () => {
    const t = await import('../src/lib/server/time');
    const { createAllocation } = await import('../src/lib/server/allocations');
    const pid = await hourlyProject('Override test', 20_000);
    await createAllocation(alice.scope, pid, {
      assigneeUserId: alice.user.id,
      startDate: T0 - 30 * 24 * HOUR,
      endDate: T0 + 30 * 24 * HOUR,
      minutesPerWeek: 600,
      hourlyRate: 35_000
    });

    await t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: pid });
    const [row] = await t.listTimeEntries(alice.scope, { projectId: pid });
    expect(row.hourlyRate).toBe(35_000);
  });

  test('the snapshot survives a later change to the project rate', async () => {
    const t = await import('../src/lib/server/time');
    const { updateProject } = await import('../src/lib/server/saveProject');
    const pid = await hourlyProject('History test', 15_000);
    await t.createEntry(alice.scope, { startedAt: T0, minutes: 120, projectId: pid });

    // Raise the price. Already-recorded hours must keep the old one.
    await updateProject(alice.scope, pid, { hourlyRate: 99_000 });

    const [row] = await t.listTimeEntries(alice.scope, { projectId: pid });
    expect(row.hourlyRate).toBe(15_000);

    const summary = await t.timeSummary(alice.scope, { projectId: pid });
    expect(summary.amountByCurrency.EUR).toBe(30_000); // 2h at 150.00
  });

  test('an unbilled project produces non-billable time with no rate', async () => {
    const t = await import('../src/lib/server/time');
    const { createProject } = await import('../src/lib/server/saveProject');
    const pid = (await createProject(alice.scope, { name: 'Internal', billingType: 'none' })).id;
    await t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: pid });

    const [row] = await t.listTimeEntries(alice.scope, { projectId: pid });
    expect(row).toMatchObject({ billable: false, hourlyRate: null });
  });

  test('a retainer bills like hourly does', async () => {
    const t = await import('../src/lib/server/time');
    const { createProject } = await import('../src/lib/server/saveProject');
    const pid = (
      await createProject(alice.scope, {
        name: 'Retained',
        billingType: 'retainer',
        monthlyFee: 400_000,
        currency: 'EUR'
      })
    ).id;
    await t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: pid });
    const [row] = await t.listTimeEntries(alice.scope, { projectId: pid });
    expect(row.billable).toBe(true);
  });

  test('re-filing an entry onto another project re-prices it', async () => {
    const t = await import('../src/lib/server/time');
    const cheap = await hourlyProject('Cheap', 10_000);
    const dear = await hourlyProject('Dear', 50_000);
    const { id } = await t.createEntry(alice.scope, {
      startedAt: T0,
      minutes: 60,
      projectId: cheap
    });

    await t.updateEntry(alice.scope, id, { projectId: dear });
    const [row] = await t.listTimeEntries(alice.scope, { projectId: dear });
    expect(row.hourlyRate).toBe(50_000);
  });
});

describe('ownership', () => {
  test('a member cannot edit or delete a colleague entry', async () => {
    const t = await import('../src/lib/server/time');
    const { id } = await t.createEntry(alice.scope, { startedAt: T0, minutes: 30 });

    await expect(t.updateEntry(bobIn, id, { description: 'not mine' })).rejects.toMatchObject({
      status: 403
    });
    await expect(t.deleteEntry(bobIn, id)).rejects.toMatchObject({ status: 403 });

    await t.deleteEntry(alice.scope, id);
  });

  test('an admin can correct a colleague entry', async () => {
    const t = await import('../src/lib/server/time');
    const { id } = await t.createEntry(bobIn, { startedAt: T0, minutes: 30 });

    await t.updateEntry(adminScope, id, { description: 'corrected' });
    const rows = await t.listTimeEntries(adminScope, { userId: bob.user.id });
    expect(rows.find((r) => r.id === id)?.description).toBe('corrected');

    await t.deleteEntry(adminScope, id);
  });

  test('another workspace sees nothing and cannot reach a row', async () => {
    const t = await import('../src/lib/server/time');
    const stranger = await makeTenant('stranger-own');
    const { id } = await t.createEntry(alice.scope, { startedAt: T0, minutes: 30 });

    expect(await t.listTimeEntries(stranger.scope, { userId: 'all' })).toHaveLength(0);
    await expect(t.updateEntry(stranger.scope, id, { description: 'x' })).rejects.toThrow(
      'not_found'
    );

    await t.deleteEntry(alice.scope, id);
  });
});

describe('listing and summary', () => {
  test('defaults to the caller, and `all` widens it', async () => {
    const t = await import('../src/lib/server/time');
    const at = Date.parse('2026-05-01T09:00:00Z');
    const mine = await t.createEntry(alice.scope, { startedAt: at, minutes: 60 });
    const theirs = await t.createEntry(bobIn, { startedAt: at, minutes: 60 });

    const own = await t.listTimeEntries(alice.scope, { from: at, to: at + HOUR });
    expect(own.map((r) => r.id)).toEqual([mine.id]);

    const all = await t.listTimeEntries(alice.scope, { userId: 'all', from: at, to: at + HOUR });
    expect(all.map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());

    await t.deleteEntry(alice.scope, mine.id);
    await t.deleteEntry(bobIn, theirs.id);
  });

  test('a running entry is excluded from the summary', async () => {
    const t = await import('../src/lib/server/time');
    const pid = await hourlyProject('Live', 12_000);
    await t.createEntry(alice.scope, { startedAt: T0, minutes: 60, projectId: pid });
    await t.startTimer(alice.scope, { projectId: pid });

    const summary = await t.timeSummary(alice.scope, { projectId: pid });
    // The finished hour only — an unfinished one is not yet invoiceable, and
    // counting it would make every refresh show a different total.
    expect(summary.totalMinutes).toBe(60);

    await clearTimers(alice.scope);
  });

  test('groups by project, biggest first, and totals per currency', async () => {
    const t = await import('../src/lib/server/time');
    const at = Date.parse('2026-07-01T09:00:00Z');
    const eur = await hourlyProject('EUR work', 10_000, 'EUR');
    const usd = await hourlyProject('USD work', 20_000, 'USD');
    await t.createEntry(alice.scope, { startedAt: at, minutes: 60, projectId: eur });
    await t.createEntry(alice.scope, { startedAt: at + HOUR, minutes: 180, projectId: usd });

    const summary = await t.timeSummary(alice.scope, { from: at, to: at + 6 * HOUR });
    expect(summary.totalMinutes).toBe(240);
    expect(summary.billableMinutes).toBe(240);
    expect(summary.groups[0].projectName).toBe('USD work');
    expect(summary.amountByCurrency).toEqual({ EUR: 10_000, USD: 60_000 });
  });

  test('trackedByProject sums finished time per project', async () => {
    const t = await import('../src/lib/server/time');
    const at = Date.parse('2026-09-01T09:00:00Z');
    const pid = await hourlyProject('Tracked', 10_000);
    await t.createEntry(alice.scope, { startedAt: at, minutes: 90, projectId: pid });
    await t.createEntry(alice.scope, { startedAt: at + 3 * HOUR, minutes: 30, projectId: pid });

    const map = await t.trackedByProject(alice.scope, [pid]);
    expect(map.get(pid)).toBe(120);
    expect(await t.trackedByProject(alice.scope, [])).toEqual(new Map());
  });

  test('deleting a project keeps its hours, unfiled', async () => {
    const t = await import('../src/lib/server/time');
    const { deleteProject } = await import('../src/lib/server/saveProject');
    const at = Date.parse('2026-10-01T09:00:00Z');
    const pid = await hourlyProject('Doomed', 10_000);
    const { id } = await t.createEntry(alice.scope, { startedAt: at, minutes: 60, projectId: pid });

    await deleteProject(alice.scope, pid);

    const rows = await t.listTimeEntries(alice.scope, { from: at, to: at + HOUR });
    const row = rows.find((r) => r.id === id);
    expect(row).toBeDefined();
    // SET NULL, not CASCADE — the hours survive, detached from the project.
    expect(row!.projectId).toBeNull();
    expect(row!.hourlyRate).toBe(10_000);
  });
});
