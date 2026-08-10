import { afterAll, beforeAll, expect, test } from 'vitest';
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
