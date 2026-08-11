import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * The list pages now insert the row a create returns instead of calling
 * `invalidateAll()`. That makes the POST response shape a contract: if it stops
 * matching what the list query produces, rows render blank until the next full
 * reload — a failure that is invisible to the type checker, because the client
 * receives `unknown` off the wire.
 *
 * These call the route handlers directly rather than over HTTP, so they run in
 * the same node-only suite as everything else.
 */

let ctx: TestDb;
let alice: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
}, 60_000);

afterAll(() => ctx?.cleanup());

function eventFor(tenant: Tenant, body: unknown) {
  return {
    request: new Request('http://localhost/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { user: tenant.user, sessionId: null }
  } as never;
}

test('POST /api/people returns the row in list shape', async () => {
  const { POST } = await import('../src/routes/api/people/+server');
  const { fetchPersonRow } = await import('../src/lib/server/people-rows');

  const res = await POST(eventFor(alice, { name: 'Ada Lovelace', role: 'Engineer' }));
  expect(res.status).toBe(201);
  const created = (await res.json()) as { id: string; row: Record<string, unknown> };

  expect(created.row).toBeTruthy();
  // The contract that matters: identical to what the list query would return.
  const fromList = await fetchPersonRow(alice.scope, created.id);
  expect(created.row).toEqual(fromList);

  // And the fields the row template actually reads are present, including the
  // joined ones that a naive `SELECT *` would miss.
  for (const key of [
    'id',
    'name',
    'role',
    'companyId',
    'companyName',
    'companyDomain',
    'companyFaviconUrl',
    'companyLogoUrl',
    'priority',
    'statusId',
    'isFavorite',
    'isArchived',
    'createdAt',
    'updatedAt',
    'lastAt'
  ]) {
    expect(Object.keys(created.row)).toContain(key);
  }
});

test('POST /api/companies returns the row in list shape', async () => {
  const { POST } = await import('../src/routes/api/companies/+server');
  const { fetchCompanyRow } = await import('../src/lib/server/companies-rows');

  const req = new Request('http://localhost/api/companies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Acme Corp', industry: 'Software' })
  });
  const res = await POST({ request: req, locals: { user: alice.user, sessionId: null } } as never);
  expect(res.status).toBe(201);
  const created = (await res.json()) as { id: string; row: Record<string, unknown> };

  expect(created.row).toBeTruthy();
  expect(created.row).toEqual(await fetchCompanyRow(alice.scope, created.id));
  for (const key of ['id', 'name', 'domain', 'logoUrl', 'industry', 'sizeBand', 'lastAt']) {
    expect(Object.keys(created.row)).toContain(key);
  }
});

test('a created row is scoped to its own workspace', async () => {
  const bob = await makeTenant('bob');
  const { POST } = await import('../src/routes/api/people/+server');
  const { fetchPersonRow } = await import('../src/lib/server/people-rows');

  const res = await POST(eventFor(bob, { name: 'Grace Hopper' }));
  const created = (await res.json()) as { id: string };

  expect(await fetchPersonRow(bob.scope, created.id)).toBeTruthy();
  expect(await fetchPersonRow(alice.scope, created.id)).toBeNull();
});

describe('saving with a URL *and* parsed data', () => {
  /**
   * The extension's entire premise. `savePerson(s, url, manual)` used to return
   * early on the URL branch and drop `manual` on the floor: the row got a name
   * derived from the URL slug, `source: 'parsing'`, and a server-side OG fetch
   * against the very page the server cannot read. Everything the extension
   * scraped from the authenticated DOM was discarded.
   */
  test('keeps the parsed fields instead of the URL-derived fallback', async () => {
    const { savePerson } = await import('../src/lib/server/savePerson');
    const { fetchPersonRow } = await import('../src/lib/server/people-rows');

    const res = await savePerson(alice.scope, 'https://www.linkedin.com/in/ada-lovelace', {
      name: 'Ada Lovelace',
      role: 'Engineer',
      email: 'ada@example.com',
      location: 'London'
    });
    const row = await fetchPersonRow(alice.scope, res.id);

    expect(row!.name).toBe('Ada Lovelace');
    expect(row!.role).toBe('Engineer');
    expect(row!.email).toBe('ada@example.com');
    expect(row!.url).toContain('linkedin.com/in/ada-lovelace');
    // Not 'parsing': that hands the row to the boot janitor and renders a
    // spinner, for data that arrived complete with the request.
    expect(row!.source).toBeNull();
  });

  test('a plain URL save still enriches in the background', async () => {
    const { savePerson } = await import('../src/lib/server/savePerson');
    const { fetchPersonRow } = await import('../src/lib/server/people-rows');
    const res = await savePerson(alice.scope, 'https://github.com/torvalds');
    const row = await fetchPersonRow(alice.scope, res.id);
    expect(row!.source).toBe('parsing');
  });

  test('re-capturing an existing URL updates it rather than duplicating', async () => {
    const { savePerson } = await import('../src/lib/server/savePerson');
    const { fetchPersonRow } = await import('../src/lib/server/people-rows');
    const url = 'https://www.linkedin.com/in/grace-hopper';

    const first = await savePerson(alice.scope, url, { name: 'Grace Hopper' });
    const second = await savePerson(alice.scope, url, {
      name: 'Grace Hopper',
      role: 'Rear Admiral'
    });

    expect(second.dedup).toBe(true);
    expect(second.id).toBe(first.id);
    const row = await fetchPersonRow(alice.scope, first.id);
    expect(row!.role).toBe('Rear Admiral');
  });

  test('companies behave the same way', async () => {
    const { saveCompany } = await import('../src/lib/server/saveCompany');
    const { fetchCompanyRow } = await import('../src/lib/server/companies-rows');
    const res = await saveCompany(alice.scope, 'https://stripe.com', {
      name: 'Stripe',
      industry: 'Payments'
    });
    const row = await fetchCompanyRow(alice.scope, res.id);
    expect(row!.name).toBe('Stripe');
    expect(row!.industry).toBe('Payments');
    expect(row!.source).toBeNull();
  });
});
