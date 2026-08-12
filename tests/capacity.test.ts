/**
 * The availability window.
 *
 * The cases that matter: a span crossing the window edge, a partial week being
 * pro-rated, two allocations on one project merging into one breakdown entry,
 * the default capacity applying to someone who never set one, and archived work
 * not counting as commitment.
 */
import { beforeAll, afterAll, expect, test, describe } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, joinWorkspace, type Tenant } from './helpers/fixtures';

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

const at = (iso: string) => Date.parse(iso);
/** A Monday, so windows line up with week boundaries in the assertions. */
const MON = at('2026-02-02T00:00:00Z');

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  await joinWorkspace(alice, bob, 'member');
}, 120_000);

afterAll(() => ctx?.cleanup());

/** A fresh project each time, so tests don't have to undo each other. */
async function project(name: string, status: 'active' | 'archived' = 'active') {
  const { createProject } = await import('../src/lib/server/saveProject');
  return (await createProject(alice.scope, { name, status })).id;
}

async function allocate(
  projectId: string,
  assigneeUserId: string,
  startIso: string,
  endIso: string,
  hoursPerWeek: number
) {
  const { createAllocation } = await import('../src/lib/server/allocations');
  return (
    await createAllocation(alice.scope, projectId, {
      assigneeUserId,
      startDate: at(startIso),
      endDate: at(endIso),
      minutesPerWeek: hoursPerWeek * 60
    })
  ).id;
}

function rowFor(win: { rows: { userId: string }[] }, userId: string) {
  const row = win.rows.find((r) => r.userId === userId);
  if (!row) throw new Error('row missing');
  return row as never as {
    userId: string;
    name: string;
    capacityMinutes: number;
    capacityIsExplicit: boolean;
    peakAllocated: number;
    cells: { allocated: number; projects: { projectId: string; projectName: string; minutes: number }[] }[];
  };
}

describe('window shape', () => {
  test('returns the requested number of weeks and every member', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const win = await capacityWindow(alice.scope, { from: MON, weeks: 12 });
    expect(win.weeks).toHaveLength(12);
    expect(win.weekCount).toBe(12);
    expect(win.from).toBe(MON);
    expect(win.rows.map((r) => r.name).sort()).toEqual(['alice', 'bob']);
    // Every row has one cell per week, even with nothing allocated.
    expect(win.rows.every((r) => r.cells.length === 12)).toBe(true);
  });

  test('clamps a silly week count instead of building it', async () => {
    const { capacityWindow, MAX_WEEKS } = await import('../src/lib/server/capacity');
    expect((await capacityWindow(alice.scope, { from: MON, weeks: 9999 })).weeks).toHaveLength(
      MAX_WEEKS
    );
    expect((await capacityWindow(alice.scope, { from: MON, weeks: 0 })).weeks).toHaveLength(1);
    expect((await capacityWindow(alice.scope, { from: MON, weeks: -5 })).weeks).toHaveLength(1);
  });

  test('members with no explicit capacity run on the default', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { DEFAULT_WEEKLY_CAPACITY_MINUTES } = await import('../src/lib/duration');
    const win = await capacityWindow(alice.scope, { from: MON, weeks: 4 });
    const row = rowFor(win, bob.user.id);
    expect(row.capacityMinutes).toBe(DEFAULT_WEEKLY_CAPACITY_MINUTES);
    expect(row.capacityIsExplicit).toBe(false);
  });
});

describe('allocation bucketing', () => {
  test('a full-window allocation fills every week at its weekly hours', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Steady retainer');
    const id = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 16);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 4 });
    const row = rowFor(win, bob.user.id);
    expect(row.cells.map((c) => c.allocated)).toEqual([960, 960, 960, 960]);
    expect(row.peakAllocated).toBe(960);
    expect(row.cells[0].projects).toEqual([
      { projectId: p, projectName: 'Steady retainer', minutes: 960 }
    ]);

    await deleteAllocation(alice.scope, id);
  });

  test('a span crossing the window edge still lands in the window', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Long engagement');
    // Starts before the window and ends after it — neither endpoint is inside.
    const id = await allocate(p, bob.user.id, '2025-06-01', '2027-06-01', 8);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 3 });
    expect(rowFor(win, bob.user.id).cells.map((c) => c.allocated)).toEqual([480, 480, 480]);

    await deleteAllocation(alice.scope, id);
  });

  test('a partial first and last week are pro-rated', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Short burst');
    // Wed 4 Feb → Tue 10 Feb. Week 1 gets Wed–Sun (5/7), week 2 Mon–Tue (2/7).
    const id = await allocate(p, bob.user.id, '2026-02-04', '2026-02-10', 14);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 3 });
    const cells = rowFor(win, bob.user.id).cells;
    expect(cells[0].allocated).toBe(Math.round((840 * 5) / 7)); // 600
    expect(cells[1].allocated).toBe(Math.round((840 * 2) / 7)); // 240
    expect(cells[2].allocated).toBe(0);

    await deleteAllocation(alice.scope, id);
  });

  test('two allocations on one project merge into a single breakdown entry', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Ramping down');
    // The shape a ramp-down is actually written in: two overlapping rows.
    const a = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 10);
    const b = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 6);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 2 });
    const cell = rowFor(win, bob.user.id).cells[0];
    expect(cell.allocated).toBe(960);
    expect(cell.projects).toHaveLength(1);
    expect(cell.projects[0]).toMatchObject({ projectId: p, minutes: 960 });

    await deleteAllocation(alice.scope, a);
    await deleteAllocation(alice.scope, b);
  });

  test('the breakdown sums to the cell total and is ordered biggest first', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const small = await project('Small thing');
    const big = await project('Big thing');
    const a = await allocate(small, bob.user.id, '2026-01-01', '2026-12-31', 4);
    const b = await allocate(big, bob.user.id, '2026-01-01', '2026-12-31', 20);

    const cell = rowFor(await capacityWindow(alice.scope, { from: MON, weeks: 1 }), bob.user.id)
      .cells[0];
    expect(cell.projects.map((p) => p.projectName)).toEqual(['Big thing', 'Small thing']);
    expect(cell.projects.reduce((n, p) => n + p.minutes, 0)).toBe(cell.allocated);

    await deleteAllocation(alice.scope, a);
    await deleteAllocation(alice.scope, b);
  });

  test('archived projects are not commitment', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Finished last year', 'archived');
    const id = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 40);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 2 });
    expect(rowFor(win, bob.user.id).peakAllocated).toBe(0);

    await deleteAllocation(alice.scope, id);
  });
});

describe('ordering and tenancy', () => {
  test('the busiest member sorts first', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Heavy');
    // alice sorts before bob alphabetically, so loading bob proves it is the
    // peak doing the ordering rather than the name.
    const id = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 30);

    const win = await capacityWindow(alice.scope, { from: MON, weeks: 4 });
    expect(win.rows[0].userId).toBe(bob.user.id);

    await deleteAllocation(alice.scope, id);
  });

  test('another workspace sees only its own members and nothing allocated', async () => {
    const { capacityWindow } = await import('../src/lib/server/capacity');
    const { deleteAllocation } = await import('../src/lib/server/allocations');
    const p = await project('Alices work');
    const id = await allocate(p, bob.user.id, '2026-01-01', '2026-12-31', 20);

    // Bob's own workspace: he is its only member, and Alice's allocation of his
    // time lives in her workspace, not his.
    const win = await capacityWindow(bob.scope, { from: MON, weeks: 4 });
    expect(win.rows.map((r) => r.name)).toEqual(['bob']);
    expect(win.rows[0].peakAllocated).toBe(0);

    await deleteAllocation(alice.scope, id);
  });
});

describe('loadRatio', () => {
  test('is allocated over capacity, and treats zero capacity as fully booked', async () => {
    const { loadRatio } = await import('../src/lib/server/capacity');
    expect(loadRatio(960, 2400)).toBeCloseTo(0.4);
    expect(loadRatio(2400, 2400)).toBe(1);
    expect(loadRatio(3000, 2400)).toBeGreaterThan(1);
    expect(loadRatio(0, 0)).toBe(0);
    expect(loadRatio(60, 0)).toBe(Infinity);
  });
});
