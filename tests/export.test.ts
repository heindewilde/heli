import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * The export column lists are a file format: somebody's spreadsheet, script or
 * re-import depends on the order, and nothing else in the app would notice if
 * it moved. So the headers are asserted literally rather than derived.
 *
 * The other thing pinned here is the tenancy contract on the id selector: a
 * selection goes stale between the tick and the click, so ids the workspace
 * does not own must resolve to nothing rather than raise.
 */

let ctx: TestDb;
let alice: Tenant;
let outsider: Tenant;

let adaId: string;
let graceId: string;
let archivedId: string;
let acmeId: string;
let outsiderPersonId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  outsider = await makeTenant('outsider');

  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { db } = await import('../src/lib/server/db');
  const { people } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  adaId = (await savePerson(alice.scope, null, { name: 'Ada Lovelace', email: 'ada@example.com' })).id;
  graceId = (await savePerson(alice.scope, null, { name: 'Grace Hopper' })).id;
  archivedId = (await savePerson(alice.scope, null, { name: 'Archie Archived' })).id;
  acmeId = (await saveCompany(alice.scope, null, { name: 'Acme Analytical' })).id;
  outsiderPersonId = (await savePerson(outsider.scope, null, { name: 'Mallory' })).id;

  await db(alice.scope.region)
    .update(people)
    .set({ isArchived: 1 })
    .where(eq(people.id, archivedId));
});

test('the people header is exactly the documented column list', async () => {
  const { PEOPLE_HEADER } = await import('../src/lib/server/export');
  expect([...PEOPLE_HEADER]).toEqual([
    'id', 'name', 'url', 'domain', 'handle', 'role', 'company_id', 'email', 'phone',
    'location', 'avatar_url', 'notes', 'tags', 'is_favorite', 'is_archived',
    'created_at', 'updated_at'
  ]);
});

test('the companies header is exactly the documented column list', async () => {
  const { COMPANIES_HEADER } = await import('../src/lib/server/export');
  expect([...COMPANIES_HEADER]).toEqual([
    'id', 'name', 'url', 'domain', 'description', 'industry', 'location', 'logo_url',
    'notes', 'tags', 'is_favorite', 'is_archived', 'created_at', 'updated_at'
  ]);
});

test('the collection header is the union, kind first', async () => {
  const { COLLECTION_HEADER, PEOPLE_HEADER, COMPANIES_HEADER } = await import(
    '../src/lib/server/export'
  );
  expect([...COLLECTION_HEADER]).toEqual([
    'kind',
    'id', 'name', 'url', 'domain', 'handle', 'role', 'company_id', 'email', 'phone',
    'location', 'avatar_url', 'description', 'industry', 'logo_url', 'notes', 'tags',
    'is_favorite', 'is_archived', 'created_at', 'updated_at'
  ]);
  // Nothing a single-kind export carries may be missing from the merged file.
  for (const col of [...PEOPLE_HEADER, ...COMPANIES_HEADER]) {
    expect(COLLECTION_HEADER, col).toContain(col);
  }
});

test('archived rows follow the explicit flag, in both directions', async () => {
  const { peopleExportTable } = await import('../src/lib/server/export');

  const hidden = await peopleExportTable(alice.scope, {
    by: 'filters',
    params: new URLSearchParams('archived=0')
  });
  expect(hidden.rows.map((r) => r[0])).not.toContain(archivedId);

  const shown = await peopleExportTable(alice.scope, {
    by: 'filters',
    params: new URLSearchParams('archived=1')
  });
  expect(shown.rows.map((r) => r[0])).toContain(archivedId);
});

test('a filtered export honours the same params the list page reads', async () => {
  const { peopleExportTable } = await import('../src/lib/server/export');
  const t = await peopleExportTable(alice.scope, {
    by: 'filters',
    params: new URLSearchParams('q=Lovelace')
  });
  expect(t.rows.map((r) => r[0])).toEqual([adaId]);
});

test('the id selector returns only workspace rows, and never raises on a foreign id', async () => {
  const { peopleExportTable } = await import('../src/lib/server/export');
  const t = await peopleExportTable(alice.scope, {
    by: 'ids',
    ids: [adaId, outsiderPersonId, 'does-not-exist', graceId]
  });
  const ids = t.rows.map((r) => r[0]);
  expect(ids).toHaveLength(2);
  expect(ids).toContain(adaId);
  expect(ids).toContain(graceId);
  expect(ids).not.toContain(outsiderPersonId);
});

test('the id selector exports archived rows — a tick is an explicit choice', async () => {
  const { peopleExportTable } = await import('../src/lib/server/export');
  const t = await peopleExportTable(alice.scope, { by: 'ids', ids: [archivedId] });
  expect(t.rows.map((r) => r[0])).toEqual([archivedId]);
});

test('the id selector chunks past 200 ids without dropping any', async () => {
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { peopleExportTable } = await import('../src/lib/server/export');

  const many: string[] = [];
  for (let i = 0; i < 250; i++) {
    many.push((await savePerson(alice.scope, null, { name: `Bulk ${i}` })).id);
  }
  const t = await peopleExportTable(alice.scope, { by: 'ids', ids: many });
  expect(new Set(t.rows.map((r) => r[0])).size).toBe(250);
});

test('parseExportBody bounds and normalises the id list', async () => {
  const { parseExportBody, MAX_EXPORT_IDS } = await import('../src/lib/server/export');

  expect(parseExportBody({ kind: 'people', ids: ['a', 'a', 'b'] })).toEqual({
    kind: 'people',
    ids: ['a', 'b']
  });
  expect(() => parseExportBody({ kind: 'projects', ids: ['a'] })).toThrow();
  expect(() => parseExportBody({ kind: 'people', ids: [] })).toThrow();
  expect(() => parseExportBody(null)).toThrow();
  expect(() =>
    parseExportBody({ kind: 'people', ids: Array.from({ length: MAX_EXPORT_IDS + 1 }, (_, i) => `x${i}`) })
  ).toThrow();
});

test('a collection exports both kinds into one table, blanks where a column does not apply', async () => {
  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { collectionExportTable, COLLECTION_HEADER } = await import('../src/lib/server/export');

  const col = await createCollection(alice.scope, { name: 'Q3 prospects' });
  await addToCollection(alice.scope, col.id, 'person', adaId);
  await addToCollection(alice.scope, col.id, 'company', acmeId);

  const { table, name } = await collectionExportTable(alice.scope, col.id, 'all');
  expect(name).toBe('Q3 prospects');
  expect(table.rows).toHaveLength(2);

  const col_ = (row: readonly unknown[], key: string) => row[COLLECTION_HEADER.indexOf(key as never)];
  const person = table.rows.find((r) => r[0] === 'person')!;
  const company = table.rows.find((r) => r[0] === 'company')!;

  expect(col_(person, 'id')).toBe(adaId);
  expect(col_(person, 'email')).toBe('ada@example.com');
  // A person has no company-only columns.
  expect(col_(person, 'description')).toBe('');
  expect(col_(person, 'industry')).toBe('');
  expect(col_(person, 'logo_url')).toBe('');

  expect(col_(company, 'id')).toBe(acmeId);
  expect(col_(company, 'name')).toBe('Acme Analytical');
  // A company has no person-only columns.
  for (const k of ['handle', 'role', 'company_id', 'email', 'phone', 'avatar_url']) {
    expect(col_(company, k), k).toBe('');
  }

  // Every row is the full width of the header, or the CSV is silently shifted.
  for (const r of table.rows) expect(r).toHaveLength(COLLECTION_HEADER.length);
});

test('members=people narrows the collection export to people', async () => {
  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { collectionExportTable } = await import('../src/lib/server/export');

  const col = await createCollection(alice.scope, { name: 'Mixed' });
  await addToCollection(alice.scope, col.id, 'person', adaId);
  await addToCollection(alice.scope, col.id, 'company', acmeId);

  const people = await collectionExportTable(alice.scope, col.id, 'people');
  expect(people.table.rows.map((r) => r[0])).toEqual(['person']);

  const companies = await collectionExportTable(alice.scope, col.id, 'companies');
  expect(companies.table.rows.map((r) => r[0])).toEqual(['company']);
});

test("another workspace's collection is a 404, not an empty file", async () => {
  const { createCollection } = await import('../src/lib/server/collections');
  const { collectionExportTable } = await import('../src/lib/server/export');

  const theirs = await createCollection(outsider.scope, { name: 'Private' });
  await expect(collectionExportTable(alice.scope, theirs.id, 'all')).rejects.toThrow();
});

test('tags are pipe-joined, matching the documented encoding', async () => {
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');
  const { peopleExportTable, PEOPLE_HEADER } = await import('../src/lib/server/export');

  for (const n of ['Investor', 'Advisor']) {
    const t = await ensureTag(alice.scope, 'person', n);
    await attachTag(alice.scope, 'person', graceId, t.id);
  }
  const t = await peopleExportTable(alice.scope, { by: 'ids', ids: [graceId] });
  const cell = String(t.rows[0][PEOPLE_HEADER.indexOf('tags')]);
  expect(cell.split('|').sort()).toEqual(['Advisor', 'Investor']);
});

test('a bare API URL still means the whole library, archived included', async () => {
  // The regression this guards: /api/export?kind=people has meant "everything"
  // since it was written, and a bookmark or a cron backup is pointed at exactly
  // that URL. Wiring in the list page's filter parser — whose default is "hide
  // archived" — silently made it return fewer rows with no error to notice.
  const { peopleExportTable } = await import('../src/lib/server/export');

  const bare = await peopleExportTable(alice.scope, {
    by: 'filters',
    params: new URLSearchParams('')
  });
  expect(bare.rows.map((r) => r[0])).toContain(archivedId);

  // The list pages send the flag explicitly, so their export still matches
  // what is on screen.
  const asShown = await peopleExportTable(alice.scope, {
    by: 'filters',
    params: new URLSearchParams('archived=0')
  });
  expect(asShown.rows.map((r) => r[0])).not.toContain(archivedId);
});

test('the id selector returns one descending run, not one per chunk', async () => {
  // 300 ticked rows used to come back newest-first in blocks of 200, so the
  // date column restarted mid-file — which reads as corrupted output.
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { peopleExportTable, PEOPLE_HEADER } = await import('../src/lib/server/export');

  const ids: string[] = [];
  for (let i = 0; i < 260; i++) {
    ids.push((await savePerson(alice.scope, null, { name: `Chunked ${i}` })).id);
  }
  const t = await peopleExportTable(alice.scope, { by: 'ids', ids });
  const at = PEOPLE_HEADER.indexOf('created_at');
  const dates = t.rows.map((r) => String(r[at]));
  expect([...dates].sort().reverse()).toEqual(dates);
});
