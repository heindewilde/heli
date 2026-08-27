import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * `list-filters.ts` was extracted from two byte-identical copies inside the
 * `/people` and `/companies` loaders, and is now also what `/api/export` uses
 * to honour the filters a user can see in the URL. So a drift here is not a
 * cosmetic bug: the list and its own export would disagree about which rows
 * exist, and nobody would notice until a spreadsheet came up short.
 *
 * These tests run the fragments through a real query, because that is the only
 * thing that can catch a fragment which type-checks and filters the wrong
 * column.
 */

let ctx: TestDb;
let alice: Tenant;
let outsider: Tenant;

let adaId: string;
let graceId: string;
let archivedId: string;
let acmeId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  outsider = await makeTenant('outsider');

  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { db } = await import('../src/lib/server/db');
  const { people } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  adaId = (await savePerson(alice.scope, null, { name: 'Ada Lovelace' })).id;
  graceId = (await savePerson(alice.scope, null, { name: 'Grace Hopper' })).id;
  archivedId = (await savePerson(alice.scope, null, { name: 'Archie Archived' })).id;
  acmeId = (await saveCompany(alice.scope, null, { name: 'Acme Analytical' })).id;

  // A person in someone else's workspace: must never appear in any result.
  await savePerson(outsider.scope, null, { name: 'Mallory Outsider' });

  await db(alice.scope.region)
    .update(people)
    .set({ isArchived: 1, isFavorite: 0 })
    .where(eq(people.id, archivedId));
  await db(alice.scope.region)
    .update(people)
    .set({ isFavorite: 1, priority: 1 })
    .where(eq(people.id, adaId));
});

/** Run the people list the way the loader and the export both do. */
async function runPeople(query: string): Promise<string[]> {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/server/db');
  const {
    PERSON_LIST,
    listClauses,
    listOrderClause,
    needsLastInteractionJoin,
    parseListFilters,
    resolveTagFilter,
    tagFilterIds
  } = await import('../src/lib/server/list-filters');
  const { personLastInteractionJoin } = await import('../src/lib/server/people-rows');

  const flt = parseListFilters(new URLSearchParams(query));
  const tagRes = await resolveTagFilter(alice.scope, PERSON_LIST, flt);
  if (tagRes.kind === 'tag' && tagRes.ids.length === 0) return [];
  const cl = listClauses(PERSON_LIST, flt, tagFilterIds(tagRes));
  const order = listOrderClause(PERSON_LIST, flt.sort);
  // The module documents that `lastInteraction` references the `li.` alias and
  // the caller owns the join. Honouring that here is what pins the contract.
  const join = needsLastInteractionJoin(flt.sort)
    ? personLastInteractionJoin(alice.scope.workspaceId)
    : sql``;

  const rows = flt.fts
    ? await db(alice.scope.region).all<{ id: string }>(sql`
        SELECT p.id FROM people p
        JOIN people_fts f ON f.rowid = p.rowid
        WHERE p.workspace_id = ${alice.scope.workspaceId}
          AND f.people_fts MATCH ${flt.fts}
          ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
        ORDER BY rank
      `)
    : await db(alice.scope.region).all<{ id: string }>(sql`
        SELECT p.id FROM people p
        ${join}
        WHERE p.workspace_id = ${alice.scope.workspaceId}
          ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
        ORDER BY ${order}
      `);
  return rows.map((r) => r.id);
}

test('archived rows are excluded by default and included with archived=1', async () => {
  // This is the pairing that would silently break the Settings export: the
  // absence of the param means "hide archived", which the old export did not do.
  expect(await runPeople('')).not.toContain(archivedId);
  expect(await runPeople('archived=1')).toContain(archivedId);
});

test('favorite=1 narrows to favourites', async () => {
  expect(await runPeople('favorite=1')).toEqual([adaId]);
});

test('priority accepts a subset including the "none" sentinel', async () => {
  expect(await runPeople('priority=1')).toEqual([adaId]);

  const none = await runPeople('priority=none');
  expect(none).toContain(graceId);
  expect(none).not.toContain(adaId);

  const both = await runPeople('priority=1,none');
  expect(both).toContain(adaId);
  expect(both).toContain(graceId);
});

test('a full-text query matches and orders by rank', async () => {
  expect(await runPeople('q=Lovelace')).toEqual([adaId]);
});

test('an unknown tag slug applies no filter; a known but empty tag returns nothing', async () => {
  // Collapsing these two would make a mistyped ?tag= return the whole
  // workspace, which reads as "the filter did nothing" rather than as a typo.
  const unknown = await runPeople('tag=does-not-exist');
  expect(unknown).toContain(adaId);
  expect(unknown).toContain(graceId);

  const { ensureTag } = await import('../src/lib/server/tags');
  const empty = await ensureTag(alice.scope, 'person', 'Nobody');
  expect(await runPeople(`tag=${empty.slug}`)).toEqual([]);
});

test('a tag filter narrows to its members', async () => {
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');
  const t = await ensureTag(alice.scope, 'person', 'Investor');
  await attachTag(alice.scope, 'person', adaId, t.id);

  expect(await runPeople(`tag=${t.slug}`)).toEqual([adaId]);
});

test('every sort key produces a valid query and never leaks another workspace', async () => {
  for (const sort of ['recent', 'updated', 'name', 'lastInteraction', 'priority', 'status']) {
    const ids = await runPeople(`sort=${sort}&archived=1`);
    expect(ids).toContain(adaId);
    expect(ids).toContain(archivedId);
    expect(ids).toHaveLength(3); // never four: Mallory belongs to another tenant
  }
});

test('sort=name orders case-insensitively', async () => {
  expect(await runPeople('sort=name')).toEqual([adaId, graceId]);
});

test('an unknown sort key falls back to recent rather than raising', async () => {
  const { parseListFilters } = await import('../src/lib/server/list-filters');
  expect(parseListFilters(new URLSearchParams('sort=; DROP TABLE people')).sort).toBe('recent');
});

test('isDefaultListView is true only for the bare view', async () => {
  const { isDefaultListView, parseListFilters } = await import(
    '../src/lib/server/list-filters'
  );
  const d = (q: string) => isDefaultListView(parseListFilters(new URLSearchParams(q)), null);

  expect(d('')).toBe(true);
  for (const q of ['q=ada', 'archived=1', 'favorite=1', 'priority=1', 'status=x', 'sort=name']) {
    expect(d(q), q).toBe(false);
  }
  expect(
    isDefaultListView(parseListFilters(new URLSearchParams('')), ['some-id'])
  ).toBe(false);
});

test('the companies scope filters companies, with its own alias', async () => {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/server/db');
  const { COMPANY_LIST, listClauses, parseListFilters } = await import(
    '../src/lib/server/list-filters'
  );

  const flt = parseListFilters(new URLSearchParams(''));
  const cl = listClauses(COMPANY_LIST, flt, null);
  const rows = await db(alice.scope.region).all<{ id: string }>(sql`
    SELECT c.id FROM companies c
    WHERE c.workspace_id = ${alice.scope.workspaceId}
      ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
  `);
  expect(rows.map((r) => r.id)).toEqual([acmeId]);
});
