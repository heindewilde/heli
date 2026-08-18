import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * `getCollection` and `getCollectionDetail` share one implementation, and the
 * whole point of the split is that only the second one grows.
 *
 * The first test here is the contract: `CollectionDetail` is the body of
 * `GET /api/v1/collections/[id]` and `POST /[id]/items`, and it crosses the
 * wire as `unknown` — so no type checker can tell you when a page-only column
 * leaks into the public API. Only an assertion on the key set can. Same
 * discipline as `tests/create-returns-row.test.ts`.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

let collectionId: string;
let acmeId: string;
let employedId: string;   // person with a company
let freelanceId: string;  // person with none
let danglingId: string;   // person added, then deleted

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');

  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');

  acmeId = (await saveCompany(alice.scope, null, { name: 'Acme Corp' })).id;
  employedId = (await savePerson(alice.scope, null, {
    name: 'Ada Lovelace',
    role: 'CTO',
    companyId: acmeId
  })).id;
  freelanceId = (await savePerson(alice.scope, null, { name: 'Ben Solo', role: 'Designer' })).id;
  danglingId = (await savePerson(alice.scope, null, { name: 'Ghost' })).id;

  collectionId = (await createCollection(alice.scope, { name: 'Q3 targets' })).id;
  // Added oldest first, so the expected read-back order is the reverse.
  for (const [kind, refId] of [
    ['person', employedId],
    ['company', acmeId],
    ['person', freelanceId],
    ['person', danglingId]
  ] as const) {
    await addToCollection(alice.scope, collectionId, kind, refId);
    // addedAt is a millisecond stamp; without a gap the DESC order is rowid.
    await new Promise((r) => setTimeout(r, 2));
  }

  const founder = await ensureTag(alice.scope, 'person', 'Founder');
  const saas = await ensureTag(alice.scope, 'company', 'SaaS');
  await attachTag(alice.scope, 'person', employedId, founder.id);
  await attachTag(alice.scope, 'company', acmeId, saas.id);

  // Delete the person row out from under the membership row — `collection_items`
  // is polymorphic and carries no FK, so this is a state the app really reaches.
  const { db } = await import('../src/lib/server/db');
  const { people } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');
  await db(alice.scope.region).delete(people).where(eq(people.id, danglingId));

  return () => ctx.cleanup();
});

test('getCollection member shape is exactly the documented v1 body', async () => {
  const { getCollection } = await import('../src/lib/server/collections');
  const c = await getCollection(alice.scope, collectionId);
  expect(c).not.toBeNull();

  const person = c!.members.find((m) => m.kind === 'person')!;
  const company = c!.members.find((m) => m.kind === 'company')!;

  // If this fails, a page-only column has leaked into every API response.
  expect(Object.keys(person).sort()).toEqual(
    ['addedAt', 'avatarUrl', 'id', 'kind', 'name', 'role'].sort()
  );
  expect(Object.keys(company).sort()).toEqual(
    ['addedAt', 'domain', 'faviconUrl', 'id', 'kind', 'logoUrl', 'name'].sort()
  );
});

test('getCollectionDetail resolves the person’s company, and keeps people who have none', async () => {
  const { getCollectionDetail } = await import('../src/lib/server/collections');
  const c = await getCollectionDetail(alice.scope, collectionId);

  const ada = c!.members.find((m) => m.id === employedId)!;
  expect(ada.companyId).toBe(acmeId);
  expect(ada.companyName).toBe('Acme Corp');

  // The LEFT half of the LEFT JOIN. An inner join drops this person entirely.
  const ben = c!.members.find((m) => m.id === freelanceId);
  expect(ben).toBeDefined();
  expect(ben!.companyId).toBeNull();
  expect(ben!.companyName).toBeNull();
});

test('getCollectionDetail attaches each kind’s tags to its own members', async () => {
  const { getCollectionDetail } = await import('../src/lib/server/collections');
  const c = await getCollectionDetail(alice.scope, collectionId);

  expect(c!.members.find((m) => m.id === employedId)!.tags.map((t) => t.name)).toEqual([
    'Founder'
  ]);
  expect(c!.members.find((m) => m.id === acmeId)!.tags.map((t) => t.name)).toEqual(['SaaS']);
  expect(c!.members.find((m) => m.id === freelanceId)!.tags).toEqual([]);
});

test('a member whose row has been deleted is skipped, not returned half-built', async () => {
  const { getCollectionDetail } = await import('../src/lib/server/collections');
  const c = await getCollectionDetail(alice.scope, collectionId);
  expect(c!.members.some((m) => m.id === danglingId)).toBe(false);
  expect(c!.members.every((m) => typeof m.name === 'string')).toBe(true);
});

test('members come back newest-added first', async () => {
  const { getCollectionDetail } = await import('../src/lib/server/collections');
  const c = await getCollectionDetail(alice.scope, collectionId);
  expect(c!.members.map((m) => m.id)).toEqual([freelanceId, acmeId, employedId]);
});

test('a single-kind collection resolves — the empty-id short-circuits hold', async () => {
  const { createCollection, addToCollection, getCollectionDetail } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');

  const peopleOnly = (await createCollection(alice.scope, { name: 'People only' })).id;
  const solo = (await savePerson(alice.scope, null, { name: 'Solo' })).id;
  await addToCollection(alice.scope, peopleOnly, 'person', solo);

  const companiesOnly = (await createCollection(alice.scope, { name: 'Companies only' })).id;
  await addToCollection(alice.scope, companiesOnly, 'company', acmeId);

  const empty = (await createCollection(alice.scope, { name: 'Empty' })).id;

  expect((await getCollectionDetail(alice.scope, peopleOnly))!.members).toHaveLength(1);
  expect((await getCollectionDetail(alice.scope, companiesOnly))!.members).toHaveLength(1);
  expect((await getCollectionDetail(alice.scope, empty))!.members).toEqual([]);
});

test('another workspace can neither read the collection nor surface as a company name', async () => {
  const { getCollectionDetail, createCollection, addToCollection } = await import(
    '../src/lib/server/collections'
  );
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');

  expect(await getCollectionDetail(bob.scope, collectionId)).toBeNull();

  // Bob's person points at Bob's company. Alice's collection referencing that
  // person's id must hydrate nothing at all — not the person, not the company.
  const bobCo = (await saveCompany(bob.scope, null, { name: 'Bob Industries' })).id;
  const bobPerson = (await savePerson(bob.scope, null, { name: 'Bo', companyId: bobCo })).id;

  const leaky = (await createCollection(alice.scope, { name: 'Leaky' })).id;
  await addToCollection(alice.scope, leaky, 'person', bobPerson).catch(() => {});

  const c = await getCollectionDetail(alice.scope, leaky);
  expect(c!.members).toEqual([]);
});
