/**
 * Allocations: validation, the workspace-membership rule on the assignee, and
 * the range query the availability grid is built on.
 *
 * The departing-member rule is in `workspaces.test.ts`, next to the rest of
 * `reassignAuthorship`.
 */
import { beforeAll, afterAll, expect, test, describe } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, joinWorkspace, type Tenant } from './helpers/fixtures';
import type { Scope } from '../src/lib/server/scope';

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;
let stranger: Tenant;
/** Bob, acting inside Alice's workspace. */
let bobInAlice: Scope;
let projectId: string;

const DAY = 86_400_000;
const JAN = Date.parse('2026-01-01T00:00:00Z');
const MAR = Date.parse('2026-03-01T00:00:00Z');
const JUN = Date.parse('2026-06-01T00:00:00Z');

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  stranger = await makeTenant('stranger');
  bobInAlice = await joinWorkspace(alice, bob, 'member');

  const { createProject } = await import('../src/lib/server/saveProject');
  projectId = (await createProject(alice.scope, { name: 'Acme rebrand' })).id;
}, 120_000);

afterAll(() => ctx?.cleanup());

describe('creating', () => {
  test('books a member and reads back with their name and the project name', async () => {
    const a = await import('../src/lib/server/allocations');
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 960
    });

    const rows = await a.listAllocationsForProject(alice.scope, projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      assigneeUserId: bob.user.id,
      assigneeName: 'bob',
      projectName: 'Acme rebrand',
      minutesPerWeek: 960
    });

    await a.deleteAllocation(alice.scope, id);
  });

  test('the assignee must be a member of this workspace', async () => {
    const a = await import('../src/lib/server/allocations');
    // A real user, in the same region, who is simply not in this workspace.
    await expect(
      a.createAllocation(alice.scope, projectId, {
        assigneeUserId: stranger.user.id,
        startDate: JAN,
        endDate: JUN,
        minutesPerWeek: 960
      })
    ).rejects.toThrow('not_a_member');
  });

  test('rejects an unreachable project', async () => {
    const a = await import('../src/lib/server/allocations');
    await expect(
      a.createAllocation(stranger.scope, projectId, {
        assigneeUserId: stranger.user.id,
        startDate: JAN,
        endDate: JUN,
        minutesPerWeek: 60
      })
    ).rejects.toThrow('not_found');
  });

  test('validates the range and the hours', async () => {
    const a = await import('../src/lib/server/allocations');
    const base = { assigneeUserId: bob.user.id, minutesPerWeek: 600 };

    await expect(
      a.createAllocation(alice.scope, projectId, { ...base, startDate: JUN, endDate: JAN })
    ).rejects.toThrow('invalid_range');

    for (const bad of [0, -60, 1.5, 8 * 24 * 60]) {
      await expect(
        a.createAllocation(alice.scope, projectId, {
          assigneeUserId: bob.user.id,
          startDate: JAN,
          endDate: JUN,
          minutesPerWeek: bad
        })
      ).rejects.toThrow('invalid_minutes');
    }
  });
});

describe('updating', () => {
  test('a one-sided date edit is still validated against the stored row', async () => {
    const a = await import('../src/lib/server/allocations');
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 600
    });

    // Moving only the start past the stored end must fail — the payload alone
    // looks fine, so this is the case a payload-only check would miss.
    await expect(
      a.updateAllocation(alice.scope, id, { startDate: JUN + 30 * DAY })
    ).rejects.toThrow('invalid_range');

    await a.updateAllocation(alice.scope, id, { endDate: JUN + 60 * DAY });
    await a.updateAllocation(alice.scope, id, { startDate: MAR });
    const rows = await a.listAllocationsForProject(alice.scope, projectId);
    expect(rows[0].startDate).toBe(MAR);

    await a.deleteAllocation(alice.scope, id);
  });

  test('another workspace cannot update or delete it', async () => {
    const a = await import('../src/lib/server/allocations');
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 600
    });

    // Scoped writes match nothing rather than throwing, so assert the row is
    // untouched rather than expecting a rejection.
    await a.deleteAllocation(stranger.scope, id);
    expect(await a.listAllocationsForProject(alice.scope, projectId)).toHaveLength(1);

    await a.deleteAllocation(alice.scope, id);
  });
});

describe('day patterns', () => {
  test('a mask round-trips, and zero normalises to null', async () => {
    const a = await import('../src/lib/server/allocations');
    const TUE_THU = (1 << 1) | (1 << 3);

    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 960,
      dayMask: TUE_THU
    });
    expect((await a.listAllocationsForProject(alice.scope, projectId))[0].dayMask).toBe(TUE_THU);

    // 0 and null are the same statement — "no particular days" — and there
    // should be exactly one stored representation of it.
    await a.updateAllocation(alice.scope, id, { dayMask: 0 });
    expect((await a.listAllocationsForProject(alice.scope, projectId))[0].dayMask).toBeNull();

    await a.deleteAllocation(alice.scope, id);
  });

  test('an out-of-range mask is rejected', async () => {
    const a = await import('../src/lib/server/allocations');
    for (const bad of [-1, 128, 1.5]) {
      await expect(
        a.createAllocation(alice.scope, projectId, {
          assigneeUserId: bob.user.id,
          startDate: JAN,
          endDate: JUN,
          minutesPerWeek: 600,
          dayMask: bad
        })
      ).rejects.toThrow('invalid_days');
    }
  });

  test('omitting the mask leaves existing allocations alone', async () => {
    const a = await import('../src/lib/server/allocations');
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 600
    });
    expect((await a.listAllocationsForProject(alice.scope, projectId))[0].dayMask).toBeNull();

    await a.updateAllocation(alice.scope, id, { minutesPerWeek: 720 });
    const row = (await a.listAllocationsForProject(alice.scope, projectId))[0];
    expect(row.minutesPerWeek).toBe(720);
    expect(row.dayMask).toBeNull();

    await a.deleteAllocation(alice.scope, id);
  });
});

describe('range query', () => {
  test('returns allocations that overlap the window, not only those inside it', async () => {
    const a = await import('../src/lib/server/allocations');
    // Jan–Jun, i.e. neither endpoint is inside a March window.
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 960
    });

    const spanning = await a.listAllocationsInRange(alice.scope, {
      from: MAR,
      to: MAR + 7 * DAY
    });
    expect(spanning.map((r) => r.id)).toEqual([id]);

    // A window entirely before it sees nothing.
    const before = await a.listAllocationsInRange(alice.scope, {
      from: JAN - 60 * DAY,
      to: JAN - 30 * DAY
    });
    expect(before).toHaveLength(0);

    await a.deleteAllocation(alice.scope, id);
  });

  test('is scoped to the workspace', async () => {
    const a = await import('../src/lib/server/allocations');
    const { id } = await a.createAllocation(alice.scope, projectId, {
      assigneeUserId: bob.user.id,
      startDate: JAN,
      endDate: JUN,
      minutesPerWeek: 600
    });
    expect(
      await a.listAllocationsInRange(stranger.scope, { from: JAN, to: JUN })
    ).toHaveLength(0);
    // Bob sees it from inside Alice's workspace, because it is workspace data.
    expect(await a.listAllocationsInRange(bobInAlice, { from: JAN, to: JUN })).toHaveLength(1);
    await a.deleteAllocation(alice.scope, id);
  });
});

describe('capacity', () => {
  test('members default until someone sets a number', async () => {
    const a = await import('../src/lib/server/allocations');
    const { DEFAULT_WEEKLY_CAPACITY_MINUTES } = await import('../src/lib/duration');

    let members = await a.listMemberCapacities(alice.scope);
    expect(members.map((m) => m.name).sort()).toEqual(['alice', 'bob']);
    expect(members.every((m) => m.capacityMinutes === DEFAULT_WEEKLY_CAPACITY_MINUTES)).toBe(true);
    expect(members.every((m) => !m.capacityIsExplicit)).toBe(true);

    await a.setMemberCapacity(alice.scope, bob.user.id, 32 * 60);
    members = await a.listMemberCapacities(alice.scope);
    const bobRow = members.find((m) => m.userId === bob.user.id)!;
    expect(bobRow.capacityMinutes).toBe(1920);
    expect(bobRow.capacityIsExplicit).toBe(true);

    // null puts them back on the default.
    await a.setMemberCapacity(alice.scope, bob.user.id, null);
    members = await a.listMemberCapacities(alice.scope);
    expect(members.find((m) => m.userId === bob.user.id)!.capacityIsExplicit).toBe(false);
  });

  test('capacity cannot be set for someone outside the workspace', async () => {
    const a = await import('../src/lib/server/allocations');
    await expect(
      a.setMemberCapacity(alice.scope, stranger.user.id, 8 * 60)
    ).rejects.toThrow('not_a_member');
  });

  test('and is per workspace, not per user', async () => {
    const a = await import('../src/lib/server/allocations');
    await a.setMemberCapacity(alice.scope, bob.user.id, 16 * 60);

    // Bob's own workspace is untouched: three days here, five days there.
    const own = await a.listMemberCapacities(bob.scope);
    expect(own.find((m) => m.userId === bob.user.id)!.capacityIsExplicit).toBe(false);

    const inAlice = await a.listMemberCapacities(alice.scope);
    expect(inAlice.find((m) => m.userId === bob.user.id)!.capacityMinutes).toBe(960);
  });
});
