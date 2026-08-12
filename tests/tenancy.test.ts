import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, type Tenant } from './helpers/fixtures';

/**
 * `scripts/check-tenancy.ts` proves a workspace filter *exists*. It cannot prove
 * the filter is *correct* — a query that filters on the wrong workspace, or
 * joins a table without carrying the scope through, lints clean and leaks.
 *
 * This is the behavioural half: build two tenants with near-identical data and
 * assert that every read helper sees only its own.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

// Ids of Alice's records, so we can assert Bob never sees them.
let aliceIds: {
  person: string;
  company: string;
  interaction: string;
  project: string;
  collection: string;
  pipeline: string;
  tag: string;
  task: string;
  reminder: string;
};

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');

  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { createInteraction } = await import('../src/lib/server/saveInteraction');
  const { createCollection } = await import('../src/lib/server/collections');
  const { createPipeline } = await import('../src/lib/server/pipelines');
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');
  const { createTask } = await import('../src/lib/server/tasks');
  const { db } = await import('../src/lib/server/db');
  const { reminders, projects } = await import('../src/lib/server/schema');
  const { createId } = await import('@paralleldrive/cuid2');

  // Both tenants get a record with the SAME name, so a leak shows up as a
  // duplicate rather than as an obviously-foreign row.
  const seed = async (t: Tenant, suffix: string) => {
    const person = await savePerson(t.scope, null, { name: `Ada Lovelace ${suffix}` });
    const company = await saveCompany(t.scope, null, { name: `Acme ${suffix}` });
    const interaction = await createInteraction(t.scope, {
      type: 'note',
      title: `Kickoff ${suffix}`,
      occurredAt: Date.now(),
      personIds: [person.id]
    });
    const projectId = createId();
    const now = Date.now();
    await db(t.scope.region).insert(projects).values({
      id: projectId,
      workspaceId: t.scope.workspaceId,
      userId: t.scope.userId,
      name: `Rebrand ${suffix}`,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
    const collection = await createCollection(t.scope, { name: `Leads ${suffix}` });
    const pipeline = await createPipeline(t.scope, { name: `Sales ${suffix}` });
    const tag = await ensureTag(t.scope, 'person', `vip-${suffix}`);
    await attachTag(t.scope, 'person', person.id, tag.id);
    const task = await createTask(t.scope, {
      kind: 'person',
      refId: person.id,
      title: `Follow up ${suffix}`
    });
    const reminderId = createId();
    await db(t.scope.region).insert(reminders).values({
      id: reminderId,
      workspaceId: t.scope.workspaceId,
      userId: t.scope.userId,
      kind: 'person',
      refId: person.id,
      remindAt: now + 86_400_000,
      createdAt: now
    });

    return {
      person: person.id,
      company: company.id,
      interaction: interaction.id,
      project: projectId,
      collection: collection.id,
      pipeline: pipeline.id,
      tag: tag.id,
      task: task.id,
      reminder: reminderId
    };
  };

  aliceIds = await seed(alice, 'A');
  await seed(bob, 'B');
}, 120_000);

afterAll(() => ctx?.cleanup());

test('the two tenants really are separate workspaces', () => {
  expect(alice.scope.workspaceId).not.toBe(bob.scope.workspaceId);
  expect(alice.scope.userId).not.toBe(bob.scope.userId);
});

describe('list helpers never cross the workspace boundary', () => {
  test('listInteractions', async () => {
    const { listInteractions } = await import('../src/lib/server/interactions-query');
    const rows = await listInteractions(bob.scope);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.interaction);
    expect(rows[0].title).toContain('B');
  });

  test('listProjects', async () => {
    const { listProjects } = await import('../src/lib/server/projects-query');
    const rows = await listProjects(bob.scope);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.project);
  });

  test('listCollections', async () => {
    const { listCollections } = await import('../src/lib/server/collections');
    const rows = await listCollections(bob.scope);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.collection);
  });

  test('listPipelines', async () => {
    const { listPipelines } = await import('../src/lib/server/pipelines');
    const rows = await listPipelines(bob.scope);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.pipeline);
  });

  test('listTagsWithCounts', async () => {
    const { listTagsWithCounts } = await import('../src/lib/server/tags');
    const rows = await listTagsWithCounts(bob.scope, 'person');
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.tag);
    // The count must not include Alice's tagged person either.
    expect(rows[0].count).toBe(1);
  });

  test('searchAll', async () => {
    const { searchAll } = await import('../src/lib/server/search');
    // "Ada" matches a person in BOTH workspaces. Bob must see exactly one.
    const hits = await searchAll(bob.scope, 'Ada');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.id).not.toBe(aliceIds.person);
    }
    expect(hits.filter((h) => h.kind === 'person')).toHaveLength(1);
  });
});

describe('single-record getters refuse foreign ids', () => {
  test('getInteraction', async () => {
    const { getInteraction } = await import('../src/lib/server/interactions-query');
    expect(await getInteraction(bob.scope, aliceIds.interaction)).toBeFalsy();
  });

  test('getProject', async () => {
    const { getProject } = await import('../src/lib/server/projects-query');
    expect(await getProject(bob.scope, aliceIds.project)).toBeFalsy();
  });

  test('getCollection', async () => {
    const { getCollection } = await import('../src/lib/server/collections');
    expect(await getCollection(bob.scope, aliceIds.collection)).toBeFalsy();
  });

  test('getPipeline', async () => {
    const { getPipeline } = await import('../src/lib/server/pipelines');
    expect(await getPipeline(bob.scope, aliceIds.pipeline)).toBeFalsy();
  });

  test('listTasksForEntity on a foreign person returns nothing', async () => {
    const { listTasksForEntity } = await import('../src/lib/server/tasks');
    const rows = await listTasksForEntity(bob.scope, 'person', aliceIds.person);
    expect(rows).toEqual([]);
  });

  test('getTagsForEntity on a foreign person returns nothing', async () => {
    const { getTagsForEntity } = await import('../src/lib/server/tags');
    const rows = await getTagsForEntity(bob.scope, 'person', aliceIds.person);
    expect(rows).toEqual([]);
  });
});

describe('reminders are personal, not just workspace-scoped', () => {
  test('a second member of the same workspace does not see them', async () => {
    const { listReminders } = await import('../src/lib/server/reminders-query');
    const { db } = await import('../src/lib/server/db');
    const { scopeFor } = await import('./helpers/fixtures');

    // Put Bob into Alice's workspace as a member, then look through his eyes.
    const bobInAlicesWorkspace = await joinWorkspace(alice, bob);

    const rows = await listReminders(bobInAlicesWorkspace);
    // Alice's reminder lives in this workspace. Bob must not see it.
    expect(rows.map((r) => r.id)).not.toContain(aliceIds.reminder);
    expect(rows).toEqual([]);

    // ...while Alice still does.
    const hers = await listReminders(alice.scope);
    expect(hers.map((r) => r.id)).toContain(aliceIds.reminder);
  });
});
