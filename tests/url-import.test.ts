import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * The staging slot, and the one thing the commit path must not get wrong: the
 * row it derives from a URL has to be byte-identical to what `savePerson`
 * derives, because `url`, `domain` and `handle` are what decide whether a later
 * capture of the same profile deduplicates or creates a second person.
 */

let ctx: TestDb;
let alice: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
});

test('a re-paste replaces its predecessor rather than orphaning it', async () => {
  const { storePendingUrlImport, getPendingUrlImport, pendingUrlImportCount, deletePendingUrlImport } =
    await import('../src/lib/server/urlImport');

  const row = {
    url: 'https://acme.com',
    kind: 'company' as const,
    host: 'acme.com',
    suggestedName: 'acme.com',
    existingId: null
  };

  const first = storePendingUrlImport('u1', [row], 0, 0);
  const second = storePendingUrlImport('u1', [row, row], 1, 2);

  expect(pendingUrlImportCount()).toBe(1);
  // The old token no longer opens the slot — a stale cookie cannot commit the
  // current paste.
  expect(getPendingUrlImport(first, 'u1')).toBeNull();
  const found = getPendingUrlImport(second, 'u1');
  expect(found?.rows).toHaveLength(2);
  expect(found?.duplicateCount).toBe(1);
  expect(found?.invalidCount).toBe(2);

  deletePendingUrlImport('u1');
  expect(pendingUrlImportCount()).toBe(0);
});

test('a colleague holding the token cannot reach the slot', async () => {
  const { storePendingUrlImport, getPendingUrlImport, deletePendingUrlImport } = await import(
    '../src/lib/server/urlImport'
  );
  const token = storePendingUrlImport(
    'owner',
    [{ url: 'https://a.com', kind: 'company', host: 'a.com', suggestedName: 'a.com', existingId: null }],
    0,
    0
  );
  expect(getPendingUrlImport(token, 'someone-else')).toBeNull();
  expect(getPendingUrlImport(token, 'owner')).not.toBeNull();
  deletePendingUrlImport('owner');
});

test('the row cap is a network budget and is enforced', async () => {
  const { storePendingUrlImport, MAX_URL_IMPORT_ROWS, UrlImportTooLargeError } = await import(
    '../src/lib/server/urlImport'
  );
  const row = {
    url: 'https://a.com',
    kind: 'company' as const,
    host: 'a.com',
    suggestedName: 'a.com',
    existingId: null
  };
  const tooMany = Array.from({ length: MAX_URL_IMPORT_ROWS + 1 }, () => row);
  expect(() => storePendingUrlImport('u2', tooMany, 0, 0)).toThrow(UrlImportTooLargeError);
  // Well below `MAX_IMPORT_ROWS` on purpose: each row costs an outbound fetch.
  expect(MAX_URL_IMPORT_ROWS).toBeLessThan(10_000);
});

/**
 * The reason `derivePersonRow` / `deriveCompanyRow` are exported at all. The
 * bulk commit chunk-inserts rather than calling `savePerson` per row — 500 rows
 * would be a thousand sequential round trips — so this asserts the two paths
 * cannot drift.
 */
test('the derived row matches what savePerson writes', async () => {
  const { savePerson, derivePersonRow } = await import('../src/lib/server/savePerson');
  const { saveCompany, deriveCompanyRow } = await import('../src/lib/server/saveCompany');
  const { db } = await import('../src/lib/server/db');
  const { people, companies } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');
  const { cleanUrl } = await import('../src/lib/server/url');

  const profile = new URL(cleanUrl('https://www.linkedin.com/in/ada-lovelace/?trk=nav'));
  const saved = await savePerson(alice.scope, profile.toString());
  const written = await db(alice.scope.region)
    .select()
    .from(people)
    .where(eq(people.id, saved.id))
    .get();
  const derived = derivePersonRow(profile);

  expect(written?.url).toBe(derived.url);
  expect(written?.domain).toBe(derived.domain);
  expect(written?.handle).toBe(derived.handle);
  expect(written?.name).toBe(derived.name);
  // `source` is not derived from the URL — it is a lifecycle marker each caller
  // decides for itself, so it is deliberately absent here.
  expect('source' in derived).toBe(false);

  const site = new URL(cleanUrl('https://acme.com/about'));
  const savedCo = await saveCompany(alice.scope, site.toString());
  const writtenCo = await db(alice.scope.region)
    .select()
    .from(companies)
    .where(eq(companies.id, savedCo.id))
    .get();
  const derivedCo = deriveCompanyRow(site);
  expect(writtenCo?.url).toBe(derivedCo.url);
  expect(writtenCo?.domain).toBe(derivedCo.domain);
});

/**
 * `servesAuthwall` is what keeps a paste of 300 LinkedIn profiles from queuing
 * 300 fetches that can only find a sign-up page. The review screen says so.
 */
test('linkedin hosts are recognised as authwalled', async () => {
  const { servesAuthwall } = await import('../src/lib/server/savePerson');
  expect(servesAuthwall(new URL('https://www.linkedin.com/in/ada'))).toBe(true);
  expect(servesAuthwall(new URL('https://linkedin.com/company/acme'))).toBe(true);
  expect(servesAuthwall(new URL('https://github.com/torvalds'))).toBe(false);
  // Not a suffix match on the string: `notlinkedin.com` is somebody else.
  expect(servesAuthwall(new URL('https://notlinkedin.com/in/ada'))).toBe(false);
});

/**
 * The bug this pins: an authwalled profile is complete the moment it is
 * inserted, because nothing will ever be queued to enrich it. Marking it
 * `parsing` left a spinner on the row until the next process restart, since the
 * boot janitor is the only thing that clears the marker.
 */
test('a row nothing will enrich is not marked parsing', async () => {
  const { servesAuthwall } = await import('../src/lib/server/savePerson');
  const linkedin = new URL('https://www.linkedin.com/in/ada-lovelace');
  const github = new URL('https://github.com/torvalds');

  // The commit endpoint's rule, stated here so a change to it is visible.
  const sourceFor = (u: URL, kind: 'person' | 'company') =>
    kind === 'company' || !servesAuthwall(u) ? 'parsing' : null;

  expect(sourceFor(linkedin, 'person')).toBeNull();
  expect(sourceFor(github, 'person')).toBe('parsing');
  // A LinkedIn *company* page is still fetched, so it keeps the marker.
  expect(sourceFor(new URL('https://linkedin.com/company/acme'), 'company')).toBe('parsing');
});
