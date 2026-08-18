import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, type Tenant } from './helpers/fixtures';
import type { Scope } from '../src/lib/server/scope';

/**
 * The bulk endpoints are one place where a mistake is quiet rather than loud:
 * every statement narrows an id list that came from a browser, so the tenancy
 * contract — ids outside the workspace resolve to nothing, and do not raise —
 * is the thing worth pinning from both ends.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;
let outsider: Tenant;
let bobScope: Scope;

let ids: string[] = [];
let outsiderPersonId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  outsider = await makeTenant('outsider');
  bobScope = await joinWorkspace(alice, bob);

  const { savePerson } = await import('../src/lib/server/savePerson');
  for (const slug of ['ada', 'grace', 'katherine']) {
    const r = await savePerson(alice.scope, null, { name: slug });
    ids.push(r.id);
  }
  outsiderPersonId = (await savePerson(outsider.scope, null, { name: 'mallory' })).id;
});

test('a patch applies to every id in the workspace', async () => {
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const res = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'patch',
    fields: { priority: 1 }
  });
  expect(res.count).toBe(3);

  const { db } = await import('../src/lib/server/db');
  const { people } = await import('../src/lib/server/schema');
  const { inArray } = await import('drizzle-orm');
  const rows = await db(alice.scope.region)
    .select({ priority: people.priority })
    .from(people)
    .where(inArray(people.id, ids));
  expect(rows.every((r) => r.priority === 1)).toBe(true);
});

/**
 * The `WHERE workspace_id = ?` is what makes this a no-op rather than a leak,
 * and a no-op rather than a 404 is deliberate: a selection can go stale between
 * the tick and the click.
 */
test('an id from another workspace is ignored, not an error', async () => {
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const res = await runBulkAction(alice.scope, 'person', [outsiderPersonId], {
    kind: 'patch',
    fields: { priority: 3 }
  });
  expect(res.count).toBe(0);

  const { db } = await import('../src/lib/server/db');
  const { people } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');
  const row = await db(outsider.scope.region)
    .select({ priority: people.priority })
    .from(people)
    .where(eq(people.id, outsiderPersonId))
    .get();
  expect(row?.priority).toBeNull();
});

test('the id cap is enforced at parse time', async () => {
  const { parseBulkBody, MAX_BULK_IDS } = await import('../src/lib/server/bulk');
  const many = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `id${i}`);
  expect(() => parseBulkBody({ ids: many, action: { kind: 'delete' } })).toThrow();
  expect(() => parseBulkBody({ ids: [], action: { kind: 'delete' } })).toThrow();
  // An empty patch would report a count for having done nothing.
  expect(() => parseBulkBody({ ids: ['a'], action: { kind: 'patch', fields: {} } })).toThrow();
});

test('tagging by name creates the tag once and is idempotent', async () => {
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const first = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'tag',
    op: 'add',
    name: 'Prospect'
  });
  expect(first.count).toBe(3);

  const second = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'tag',
    op: 'add',
    name: 'Prospect'
  });
  expect(second.count).toBe(3);
  expect(second.tagId).toBe(first.tagId);

  const { listTagsWithCounts } = await import('../src/lib/server/tags');
  const tags = await listTagsWithCounts(alice.scope, 'person');
  const prospect = tags.filter((t) => t.slug === 'prospect');
  expect(prospect).toHaveLength(1);
  expect(prospect[0].count).toBe(3);

  const removed = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'tag',
    op: 'remove',
    tagId: first.tagId!
  });
  expect(removed.count).toBe(3);
  const after = await listTagsWithCounts(alice.scope, 'person');
  expect(after.find((t) => t.slug === 'prospect')?.count).toBe(0);
});

test('adding to a collection is idempotent and skips foreign ids', async () => {
  const { createCollection, getCollection } = await import('../src/lib/server/collections');
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const { id: collectionId } = await createCollection(alice.scope, { name: 'Q3 outreach' });

  const first = await runBulkAction(alice.scope, 'person', [...ids, outsiderPersonId], {
    kind: 'collection',
    op: 'add',
    collectionId
  });
  expect(first.count).toBe(3);

  const again = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'collection',
    op: 'add',
    collectionId
  });
  expect(again.count).toBe(3);

  const detail = await getCollection(alice.scope, collectionId);
  expect(detail?.members).toHaveLength(3);
});

/**
 * `requireRole` lives in `bulk.ts`, not in the route file — `check-tenancy.ts`
 * short-circuits on a `requireRole` anywhere in a handler, which would make the
 * MEMBER_ALLOWED entry dead code and hide the decision. Keeping it in the
 * helper is also what makes it testable here, since these tests call helpers.
 */
test('only owners and admins may bulk delete', async () => {
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const doomed = (await savePerson(alice.scope, null, { name: 'doomed' })).id;

  await expect(
    runBulkAction(bobScope, 'person', [doomed], { kind: 'delete' })
  ).rejects.toMatchObject({ status: 403 });

  // A member can still do everything else.
  const patched = await runBulkAction(bobScope, 'person', [doomed], {
    kind: 'patch',
    fields: { priority: 2 }
  });
  expect(patched.count).toBe(1);

  const deleted = await runBulkAction(alice.scope, 'person', [doomed], { kind: 'delete' });
  expect(deleted.count).toBe(1);
});

/**
 * No `rows` key. Returning 200 rows in list shape would mean a second joined
 * query costing more than the write, and the client already holds the values
 * it sent.
 */
test('the response carries a count and nothing else heavy', async () => {
  const { runBulkAction } = await import('../src/lib/server/bulk');
  const res = await runBulkAction(alice.scope, 'person', ids, {
    kind: 'patch',
    fields: { statusId: null }
  });
  expect(Object.keys(res).sort()).toEqual(['count']);
});
