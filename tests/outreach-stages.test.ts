import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, scopeFor, type Tenant } from './helpers/fixtures';
import type { Scope } from '../src/lib/server/scope';

/**
 * `pipeline_stage_templates` carries no workspace_id, because
 * `pipeline_stages` carries none either. Scope reaches it only by joining
 * through `pipelines` — so the thing worth testing is that a stage id from
 * another workspace is refused rather than silently attached to.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;
let outsider: Tenant;
let bobScope: Scope;

let stageId: string;
let outsiderStageId: string;
let sharedId: string;
let privateId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  outsider = await makeTenant('outsider');

  const { db } = await import('../src/lib/server/db');
  const { workspaceMembers, pipelineStages } = await import('../src/lib/server/schema');
  const { createPipeline } = await import('../src/lib/server/pipelines');
  const { createTemplate } = await import('../src/lib/server/outreach');
  const { asc, eq } = await import('drizzle-orm');

  await db(alice.scope.region).insert(workspaceMembers).values({
    workspaceId: alice.scope.workspaceId,
    userId: bob.user.id,
    role: 'member',
    createdAt: Date.now()
  });
  bobScope = scopeFor({
    ...bob.user,
    workspaceId: alice.scope.workspaceId,
    workspaceName: alice.user.workspaceName,
    role: 'member'
  });

  const pipeline = await createPipeline(alice.scope, { name: 'Fundraising' });
  const stages = await db(alice.scope.region)
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipeline.id))
    .orderBy(asc(pipelineStages.position));
  stageId = stages[0].id;

  const other = await createPipeline(outsider.scope, { name: 'Theirs' });
  const otherStages = await db(outsider.scope.region)
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, other.id))
    .orderBy(asc(pipelineStages.position));
  outsiderStageId = otherStages[0].id;

  sharedId = (
    await createTemplate(alice.scope, { name: 'Intro', platform: 'email', body: 'hi' })
  ).id;
  privateId = (
    await createTemplate(alice.scope, {
      name: 'Draft',
      platform: 'email',
      body: 'hi',
      visibility: 'private'
    })
  ).id;
}, 120_000);

afterAll(() => ctx?.cleanup());

test('templates attach to a stage in the order given', async () => {
  const { setStageTemplates, listStageTemplates, createTemplate } = await import(
    '../src/lib/server/outreach'
  );
  const second = await createTemplate(alice.scope, {
    name: 'Follow up',
    platform: 'email',
    body: 'hi again'
  });

  await setStageTemplates(alice.scope, stageId, [second.id, sharedId]);
  expect((await listStageTemplates(alice.scope, stageId)).map((t) => t.name)).toEqual([
    'Follow up',
    'Intro'
  ]);

  // Replacement, not append.
  await setStageTemplates(alice.scope, stageId, [sharedId]);
  expect((await listStageTemplates(alice.scope, stageId)).map((t) => t.name)).toEqual(['Intro']);
});

test('a stage in another workspace is not found, not attached to', async () => {
  const { setStageTemplates, listStageTemplates } = await import('../src/lib/server/outreach');
  await expect(setStageTemplates(alice.scope, outsiderStageId, [sharedId])).rejects.toThrow(
    'not_found'
  );
  await expect(listStageTemplates(alice.scope, outsiderStageId)).rejects.toThrow('not_found');
});

/**
 * An id you cannot see is dropped rather than reported, so attaching cannot be
 * used to probe for template ids in another workspace.
 */
test('an invisible template id is silently dropped', async () => {
  const { setStageTemplates, listStageTemplates, createTemplate } = await import(
    '../src/lib/server/outreach'
  );
  const theirs = await createTemplate(outsider.scope, {
    name: 'Not yours',
    platform: 'email',
    body: 'x'
  });

  await setStageTemplates(alice.scope, stageId, [sharedId, theirs.id]);
  expect((await listStageTemplates(alice.scope, stageId)).map((t) => t.id)).toEqual([sharedId]);
});

test("a colleague does not see someone's private template on a stage", async () => {
  const { setStageTemplates, listStageTemplates } = await import('../src/lib/server/outreach');
  await setStageTemplates(alice.scope, stageId, [sharedId, privateId]);

  expect((await listStageTemplates(alice.scope, stageId)).map((t) => t.id)).toEqual([
    sharedId,
    privateId
  ]);
  // Bob is in the same workspace and sees the stage, but not Alice's draft.
  expect((await listStageTemplates(bobScope, stageId)).map((t) => t.id)).toEqual([sharedId]);
});

test('attaching an empty list clears the stage', async () => {
  const { setStageTemplates, listStageTemplates } = await import('../src/lib/server/outreach');
  await setStageTemplates(alice.scope, stageId, []);
  expect(await listStageTemplates(alice.scope, stageId)).toHaveLength(0);
});

test('deleting a template takes its stage attachment with it', async () => {
  const { setStageTemplates, listStageTemplates, deleteTemplate, createTemplate } = await import(
    '../src/lib/server/outreach'
  );
  const doomed = await createTemplate(alice.scope, {
    name: 'Doomed',
    platform: 'email',
    body: 'x'
  });
  await setStageTemplates(alice.scope, stageId, [doomed.id, sharedId]);
  await deleteTemplate(alice.scope, doomed.id);
  expect((await listStageTemplates(alice.scope, stageId)).map((t) => t.id)).toEqual([sharedId]);
});
