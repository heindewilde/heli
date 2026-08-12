/**
 * Milestones and goals.
 *
 * The interesting property is tenancy: neither table carries `workspace_id`, so
 * the only thing between a stranger's project id and a cross-tenant write is
 * the `projectExists` guard at the top of every export. Most of these tests are
 * really testing that guard.
 */
import { beforeAll, afterAll, expect, test, describe } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

let ctx: TestDb;
let alice: Tenant;
let mallory: Tenant;
let projectId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  mallory = await makeTenant('mallory');
  const { createProject } = await import('../src/lib/server/saveProject');
  projectId = (await createProject(alice.scope, { name: 'Acme rebrand' })).id;
}, 120_000);

afterAll(() => ctx?.cleanup());

describe('milestones', () => {
  test('create, list, complete and delete', async () => {
    const plan = await import('../src/lib/server/project-plan');
    const due = Date.parse('2026-03-01T00:00:00Z');

    const { id } = await plan.createMilestone(alice.scope, projectId, {
      title: 'Design system delivered',
      dueAt: due
    });

    let items = await plan.listMilestones(alice.scope, projectId);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Design system delivered');
    expect(items[0].dueAt).toBe(due);
    expect(items[0].completedAt).toBeNull();

    const at = Date.now();
    await plan.updateMilestone(alice.scope, projectId, id, { completedAt: at });
    items = await plan.listMilestones(alice.scope, projectId);
    expect(items[0].completedAt).toBe(at);

    // Reopening is the same call with null, not a separate verb.
    await plan.updateMilestone(alice.scope, projectId, id, { completedAt: null });
    items = await plan.listMilestones(alice.scope, projectId);
    expect(items[0].completedAt).toBeNull();

    await plan.deleteMilestone(alice.scope, projectId, id);
    expect(await plan.listMilestones(alice.scope, projectId)).toHaveLength(0);
  });

  test('positions append, and reorder rewrites them', async () => {
    const plan = await import('../src/lib/server/project-plan');
    const a = await plan.createMilestone(alice.scope, projectId, { title: 'First' });
    const b = await plan.createMilestone(alice.scope, projectId, { title: 'Second' });
    const c = await plan.createMilestone(alice.scope, projectId, { title: 'Third' });

    expect((await plan.listMilestones(alice.scope, projectId)).map((m) => m.title)).toEqual([
      'First',
      'Second',
      'Third'
    ]);

    await plan.reorderMilestones(alice.scope, projectId, [c.id, a.id, b.id]);
    expect((await plan.listMilestones(alice.scope, projectId)).map((m) => m.title)).toEqual([
      'Third',
      'First',
      'Second'
    ]);

    for (const { id } of [a, b, c]) await plan.deleteMilestone(alice.scope, projectId, id);
  });

  test('a stranger cannot read or write another workspace projects milestones', async () => {
    const plan = await import('../src/lib/server/project-plan');
    const { id } = await plan.createMilestone(alice.scope, projectId, { title: 'Private plan' });

    await expect(plan.listMilestones(mallory.scope, projectId)).rejects.toThrow('not_found');
    await expect(
      plan.createMilestone(mallory.scope, projectId, { title: 'Injected' })
    ).rejects.toThrow('not_found');
    await expect(
      plan.updateMilestone(mallory.scope, projectId, id, { title: 'Hijacked' })
    ).rejects.toThrow('not_found');
    await expect(plan.deleteMilestone(mallory.scope, projectId, id)).rejects.toThrow('not_found');

    // Untouched.
    const items = await plan.listMilestones(alice.scope, projectId);
    expect(items.map((m) => m.title)).toEqual(['Private plan']);
    await plan.deleteMilestone(alice.scope, projectId, id);
  });

  test('a blank title is rejected', async () => {
    const plan = await import('../src/lib/server/project-plan');
    await expect(plan.createMilestone(alice.scope, projectId, { title: '   ' })).rejects.toThrow(
      'missing_title'
    );
  });

  test('deleting the project cascades its milestones away', async () => {
    const { createProject, deleteProject } = await import('../src/lib/server/saveProject');
    const plan = await import('../src/lib/server/project-plan');
    const { db } = await import('../src/lib/server/db');
    const { projectMilestones } = await import('../src/lib/server/schema');
    const { eq } = await import('drizzle-orm');

    const doomed = await createProject(alice.scope, { name: 'Cancelled' });
    await plan.createMilestone(alice.scope, doomed.id, { title: 'Never happens' });
    await deleteProject(alice.scope, doomed.id);

    const rows = await db(alice.scope.region)
      .select()
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, doomed.id));
    expect(rows).toHaveLength(0);
  });
});

describe('goals', () => {
  test('create with a target, then move the current value', async () => {
    const plan = await import('../src/lib/server/project-plan');
    const { id } = await plan.createGoal(alice.scope, projectId, {
      title: 'Ship posts',
      targetValue: 12,
      unit: 'posts'
    });

    let items = await plan.listGoals(alice.scope, projectId);
    expect(items[0]).toMatchObject({ title: 'Ship posts', targetValue: 12, currentValue: 0, unit: 'posts' });

    await plan.updateGoal(alice.scope, projectId, id, { currentValue: 7 });
    items = await plan.listGoals(alice.scope, projectId);
    expect(items[0].currentValue).toBe(7);

    await plan.deleteGoal(alice.scope, projectId, id);
  });

  test('targets and counts must be whole and non-negative', async () => {
    const plan = await import('../src/lib/server/project-plan');
    // A zero target has no progress to measure and would divide by zero in the bar.
    await expect(
      plan.createGoal(alice.scope, projectId, { title: 'Nothing', targetValue: 0 })
    ).rejects.toThrow('invalid_target');
    await expect(
      plan.createGoal(alice.scope, projectId, { title: 'Negative', targetValue: -3 })
    ).rejects.toThrow('invalid_target');
    await expect(
      plan.createGoal(alice.scope, projectId, { title: 'Fractional', targetValue: 2.5 })
    ).rejects.toThrow('invalid_target');

    const { id } = await plan.createGoal(alice.scope, projectId, { title: 'Real', targetValue: 5 });
    await expect(
      plan.updateGoal(alice.scope, projectId, id, { currentValue: -1 })
    ).rejects.toThrow('invalid_current');
    await plan.deleteGoal(alice.scope, projectId, id);
  });

  test('a stranger cannot touch them either', async () => {
    const plan = await import('../src/lib/server/project-plan');
    const { id } = await plan.createGoal(alice.scope, projectId, {
      title: 'Private target',
      targetValue: 3
    });

    await expect(plan.listGoals(mallory.scope, projectId)).rejects.toThrow('not_found');
    await expect(
      plan.updateGoal(mallory.scope, projectId, id, { currentValue: 3 })
    ).rejects.toThrow('not_found');
    await expect(plan.deleteGoal(mallory.scope, projectId, id)).rejects.toThrow('not_found');

    await plan.deleteGoal(alice.scope, projectId, id);
  });
});
