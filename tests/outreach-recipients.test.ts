import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * `collection_items` and `pipeline_items` carry no workspace_id — the join to
 * `people` is what makes these queries tenant-safe. So the case worth pinning
 * is a foreign id: it must come back empty rather than reaching across.
 */

let ctx: TestDb;
let alice: Tenant;
let outsider: Tenant;

let collectionId: string;
let outsiderCollectionId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  outsider = await makeTenant('outsider');

  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');

  collectionId = (await createCollection(alice.scope, { name: 'Targets' })).id;

  const ada = await savePerson(alice.scope, null, { name: 'Ada Lovelace', email: 'ada@x.test' });
  const grace = await savePerson(alice.scope, null, { name: 'Grace Hopper' });
  await addToCollection(alice.scope, collectionId, 'person', ada.id);
  await addToCollection(alice.scope, collectionId, 'person', grace.id);

  // A company in the same collection — templates address people, so it should
  // simply not appear.
  const acme = await saveCompany(alice.scope, null, { name: 'Acme' });
  await addToCollection(alice.scope, collectionId, 'company', acme.id);

  outsiderCollectionId = (await createCollection(outsider.scope, { name: 'Theirs' })).id;
  const theirs = await savePerson(outsider.scope, null, { name: 'Not Yours' });
  await addToCollection(outsider.scope, outsiderCollectionId, 'person', theirs.id);
}, 120_000);

afterAll(() => ctx?.cleanup());

test('a collection yields its people, sorted, with company names joined', async () => {
  const { collectionRecipients } = await import('../src/lib/server/outreach-recipients');
  const result = await collectionRecipients(alice.scope, collectionId);
  expect(result?.name).toBe('Targets');
  expect(result?.people.map((p) => p.name)).toEqual(['Ada Lovelace', 'Grace Hopper']);
  expect(result?.people[0].email).toBe('ada@x.test');
});

test('companies in a mixed collection are skipped, not reported', async () => {
  const { collectionRecipients } = await import('../src/lib/server/outreach-recipients');
  const result = await collectionRecipients(alice.scope, collectionId);
  expect(result?.people.some((p) => p.name === 'Acme')).toBe(false);
});

test("another workspace's collection is not found", async () => {
  const { collectionRecipients } = await import('../src/lib/server/outreach-recipients');
  expect(await collectionRecipients(alice.scope, outsiderCollectionId)).toBeNull();
});

test("another workspace's stage is not found", async () => {
  const { stageRecipients } = await import('../src/lib/server/outreach-recipients');
  const { createPipeline } = await import('../src/lib/server/pipelines');
  const { db } = await import('../src/lib/server/db');
  const { pipelineStages } = await import('../src/lib/server/schema');
  const { asc, eq } = await import('drizzle-orm');

  const theirs = await createPipeline(outsider.scope, { name: 'Theirs' });
  const stage = await db(outsider.scope.region)
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, theirs.id))
    .orderBy(asc(pipelineStages.position))
    .get();

  expect(await stageRecipients(alice.scope, stage!.id)).toBeNull();
});

test('a stage yields the people sitting in it', async () => {
  const { stageRecipients } = await import('../src/lib/server/outreach-recipients');
  const { createPipeline, addItemToPipeline } = await import('../src/lib/server/pipelines');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { db } = await import('../src/lib/server/db');
  const { pipelineStages } = await import('../src/lib/server/schema');
  const { asc, eq } = await import('drizzle-orm');

  const pipeline = await createPipeline(alice.scope, { name: 'Fundraising' });
  const stage = await db(alice.scope.region)
    .select({ id: pipelineStages.id, name: pipelineStages.name })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipeline.id))
    .orderBy(asc(pipelineStages.position))
    .get();

  const person = await savePerson(alice.scope, null, { name: 'Barbara Liskov' });
  await addItemToPipeline(alice.scope, pipeline.id, {
    kind: 'person',
    refId: person.id,
    stageId: stage!.id
  });

  const result = await stageRecipients(alice.scope, stage!.id);
  expect(result?.name).toBe(stage!.name);
  expect(result?.people.map((p) => p.name)).toEqual(['Barbara Liskov']);
});
