import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Pasting links into a collection.
 *
 * The interesting case is the *duplicate*: a URL that already resolves to a
 * record must not be re-created, but it must still join the collection, because
 * filing it is why the link was pasted. Getting that half-right — creating
 * nothing and adding nothing — is the failure mode that looks like the import
 * quietly dropped rows.
 */

let ctx: TestDb;
let alice: Tenant;
let outsider: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  outsider = await makeTenant('outsider');
});

test('the staging record carries the destination, and the old arity still works', async () => {
  const { storePendingUrlImport, getPendingUrlImport, deletePendingUrlImport } = await import(
    '../src/lib/server/urlImport'
  );
  const row = {
    url: 'https://acme.com',
    kind: 'company' as const,
    host: 'acme.com',
    suggestedName: 'acme.com',
    existingId: null
  };

  const withTarget = storePendingUrlImport('u1', [row], 0, 0, { id: 'col_1', name: 'Q3' });
  expect(getPendingUrlImport(withTarget, 'u1')?.collection).toEqual({ id: 'col_1', name: 'Q3' });

  // The fifth argument is optional so every existing call site keeps working.
  const withoutTarget = storePendingUrlImport('u2', [row], 0, 0);
  expect(getPendingUrlImport(withoutTarget, 'u2')?.collection).toBeNull();

  deletePendingUrlImport('u1');
  deletePendingUrlImport('u2');
});

test('addManyAndSync files both kinds and reports what actually resolved', async () => {
  const { createCollection, addManyAndSync, getCollection } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');

  const col = await createCollection(alice.scope, { name: 'Prospects' });
  const p1 = (await savePerson(alice.scope, null, { name: 'Ada' })).id;
  const p2 = (await savePerson(alice.scope, null, { name: 'Grace' })).id;
  const c1 = (await saveCompany(alice.scope, null, { name: 'Acme' })).id;
  const foreign = (await savePerson(outsider.scope, null, { name: 'Mallory' })).id;

  const added = await addManyAndSync(alice.scope, col.id, {
    person: [p1, p2, foreign],
    company: [c1]
  });

  // The foreign id resolves to nothing rather than raising, and is not counted.
  expect(added).toBe(3);

  const loaded = await getCollection(alice.scope, col.id);
  const keys = loaded!.members.map((m) => `${m.kind}:${m.id}`).sort();
  expect(keys).toEqual([`company:${c1}`, `person:${p1}`, `person:${p2}`].sort());
});

test('adding the same member twice is idempotent', async () => {
  const { createCollection, addManyAndSync, getCollection } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');

  const col = await createCollection(alice.scope, { name: 'Twice' });
  const p = (await savePerson(alice.scope, null, { name: 'Repeat' })).id;

  await addManyAndSync(alice.scope, col.id, { person: [p], company: [] });
  const second = await addManyAndSync(alice.scope, col.id, { person: [p], company: [] });

  // `addManyToCollection` reports the ids that resolved in this workspace, not
  // the ones newly inserted — so the count is 1, but the membership is still one row.
  expect(second).toBe(1);
  const loaded = await getCollection(alice.scope, col.id);
  expect(loaded!.members).toHaveLength(1);
});

test('a chunk boundary does not drop members', async () => {
  const { createCollection, addManyAndSync, getCollection } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');

  const col = await createCollection(alice.scope, { name: 'Many' });
  const ids: string[] = [];
  for (let i = 0; i < 25; i++) {
    ids.push((await savePerson(alice.scope, null, { name: `Bulk ${i}` })).id);
  }
  // A deliberately tiny chunk, so the loop runs many times in a fast test.
  const added = await addManyAndSync(alice.scope, col.id, { person: ids, company: [] }, 4);
  expect(added).toBe(25);
  const loaded = await getCollection(alice.scope, col.id);
  expect(loaded!.members).toHaveLength(25);
});

test("another workspace's collection adds nothing and does not throw", async () => {
  const { createCollection, addManyAndSync, getCollection } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');

  const theirs = await createCollection(outsider.scope, { name: 'Private' });
  const mine = (await savePerson(alice.scope, null, { name: 'Nobody' })).id;

  // The import has already written its rows by this point; losing the whole
  // commit to a 500 here would be strictly worse than filing nothing.
  const added = await addManyAndSync(alice.scope, theirs.id, { person: [mine], company: [] });
  expect(added).toBe(0);
  expect((await getCollection(outsider.scope, theirs.id))!.members).toHaveLength(0);
});

test('a synced pipeline receives every member that was filed', async () => {
  const { createCollection, addManyAndSync } = await import('../src/lib/server/collections');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { createPipeline, getPipeline } = await import('../src/lib/server/pipelines');
  const { createCollectionSync } = await import('../src/lib/server/sync');

  const col = await createCollection(alice.scope, { name: 'Synced' });
  const pipeline = await createPipeline(alice.scope, { name: 'Board' });
  await createCollectionSync(alice.scope, col.id, pipeline.id);

  const p = (await savePerson(alice.scope, null, { name: 'Boarded' })).id;
  await addManyAndSync(alice.scope, col.id, { person: [p], company: [] });

  const board = await getPipeline(alice.scope, pipeline.id);
  expect(board!.items.map((i) => i.refId)).toContain(p);
});

test('a large batch reaches a synced pipeline exactly once, without duplicating', async () => {
  // The path this guards used to be one `addItemToPipeline` per item — seven
  // round trips each — so a 500-row import into a synced collection was ~3,500
  // sequential trips after the inserts had already run.
  const { createCollection, addManyAndSync } = await import('../src/lib/server/collections');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { createPipeline, getPipeline } = await import('../src/lib/server/pipelines');
  const { createCollectionSync } = await import('../src/lib/server/sync');

  const col = await createCollection(alice.scope, { name: 'Batched' });
  const pipeline = await createPipeline(alice.scope, { name: 'Big board' });
  await createCollectionSync(alice.scope, col.id, pipeline.id);

  const ids: string[] = [];
  for (let i = 0; i < 120; i++) {
    ids.push((await savePerson(alice.scope, null, { name: `Batch ${i}` })).id);
  }

  await addManyAndSync(alice.scope, col.id, { person: ids, company: [] }, 25);
  let board = await getPipeline(alice.scope, pipeline.id);
  expect(board!.items).toHaveLength(120);
  // Every card carries the event row its history is read from.
  expect(board!.items.every((i) => i.stageId)).toBe(true);

  // Re-running must not put anyone on the board twice.
  await addManyAndSync(alice.scope, col.id, { person: ids, company: [] }, 25);
  board = await getPipeline(alice.scope, pipeline.id);
  expect(board!.items).toHaveLength(120);
});

test('a foreign id is skipped by the pipeline batch rather than raising', async () => {
  const { createCollection, addManyAndSync } = await import('../src/lib/server/collections');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { createPipeline, addManyToPipeline, getPipeline } = await import(
    '../src/lib/server/pipelines'
  );
  const { createCollectionSync } = await import('../src/lib/server/sync');

  const col = await createCollection(alice.scope, { name: 'Foreign' });
  const pipeline = await createPipeline(alice.scope, { name: 'Guarded' });
  await createCollectionSync(alice.scope, col.id, pipeline.id);

  const mine = (await savePerson(alice.scope, null, { name: 'Mine' })).id;
  const theirs = (await savePerson(outsider.scope, null, { name: 'Theirs' })).id;

  const added = await addManyToPipeline(alice.scope, pipeline.id, [
    { kind: 'person', refId: mine },
    { kind: 'person', refId: theirs }
  ]);
  expect(added).toBe(1);

  const board = await getPipeline(alice.scope, pipeline.id);
  expect(board!.items.map((i) => i.refId)).toEqual([mine]);
  void col;
});
