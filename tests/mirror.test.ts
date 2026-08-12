import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COALESCE_TARGET,
  NEXT_OUTBOX_ENTRY,
  SCHEMA,
  UPSERT_COMPANY,
  UPSERT_INTERACTION,
  UPSERT_PERSON,
  companiesQuery,
  peopleQuery
} from '../mobile/src/db/statements';

/**
 * The mobile app's local mirror, run against a real SQLite.
 *
 * `expo-sqlite` binds to the platform, so the *binding* needs a device. The SQL
 * does not — and the SQL is the part that can be wrong in ways nobody notices
 * until a list shows the wrong tenant's rows. `mobile/src/db/statements.ts`
 * holds the statements the app executes, this runs those same strings through
 * `@libsql/client`, and the two cannot drift because there is only one copy.
 *
 * A temp *file* database, not `:memory:` — the same reason `tests/helpers/testDb.ts`
 * gives: pragmas and constraints behave differently, and a test that passes for
 * the wrong reason is worse than no test.
 */

let dir: string;
let db: Client;

const WS = 'ws_alpha';
const OTHER = 'ws_beta';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'heli-mirror-'));
  db = createClient({ url: `file:${join(dir, 'mirror.db')}` });
});

afterAll(() => {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.executeMultiple(`
    DROP TABLE IF EXISTS people;
    DROP TABLE IF EXISTS companies;
    DROP TABLE IF EXISTS interactions;
    DROP TABLE IF EXISTS outbox;
    DROP TABLE IF EXISTS meta;
  `);
  await db.executeMultiple(SCHEMA);
});

function person(id: string, over: Record<string, unknown> = {}) {
  const p = {
    name: `Person ${id}`,
    role: null,
    companyId: null,
    companyName: null,
    email: null,
    phone: null,
    avatarUrl: null,
    faviconUrl: null,
    url: null,
    priority: null,
    statusId: null,
    isFavorite: 0,
    isArchived: 0,
    createdAt: 1000,
    updatedAt: 1000,
    lastAt: null,
    ...over
  };
  return [
    id, WS, p.name, p.role, p.companyId, p.companyName, p.email, p.phone,
    p.avatarUrl, p.faviconUrl, p.url, p.priority, p.statusId, p.isFavorite,
    p.isArchived, p.createdAt, p.updatedAt, p.lastAt
  ] as never[];
}

describe('the schema', () => {
  test('creates every table the app reads, and is idempotent', async () => {
    // It runs on every launch, so applying it twice must be a no-op.
    await db.executeMultiple(SCHEMA);
    const rows = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    expect(rows.rows.map((r) => String(r.name))).toEqual(
      expect.arrayContaining(['companies', 'interactions', 'meta', 'outbox', 'people'])
    );
  });
});

describe('upserts', () => {
  test('a second write updates rather than duplicating', async () => {
    await db.execute({ sql: UPSERT_PERSON, args: person('p1', { name: 'Ada' }) });
    await db.execute({
      sql: UPSERT_PERSON,
      args: person('p1', { name: 'Ada Lovelace', updatedAt: 2000 })
    });

    const rows = await db.execute(`SELECT id, name, updated_at FROM people`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].name).toBe('Ada Lovelace');
    expect(Number(rows.rows[0].updated_at)).toBe(2000);
  });

  test('a refresh does NOT clear the pending marker', async () => {
    // The property the whole optimistic story rests on. A server row landing
    // while an edit is still queued must not make the row stop looking pending
    // — the write has not happened yet, and saying otherwise is a lie the user
    // finds out about later.
    await db.execute({ sql: UPSERT_PERSON, args: person('p1') });
    await db.execute(`UPDATE people SET pending = 1 WHERE id = 'p1'`);

    await db.execute({ sql: UPSERT_PERSON, args: person('p1', { name: 'From server' }) });

    const rows = await db.execute(`SELECT name, pending FROM people WHERE id = 'p1'`);
    expect(rows.rows[0].name).toBe('From server');
    expect(Number(rows.rows[0].pending)).toBe(1);
  });

  test('an interaction upsert DOES clear pending, because a create is settled', async () => {
    // The asymmetry is deliberate: a person upsert is a refresh landing beside
    // an in-flight edit, an interaction upsert is the server's own copy of a
    // row that has just been accepted.
    const args = ['i1', WS, 500, 'call', 'Call', null, null, null, '[]', 500, 500] as never[];
    await db.execute({ sql: UPSERT_INTERACTION, args });
    await db.execute(`UPDATE interactions SET pending = 1 WHERE id = 'i1'`);
    await db.execute({ sql: UPSERT_INTERACTION, args });

    const rows = await db.execute(`SELECT pending FROM interactions WHERE id = 'i1'`);
    expect(Number(rows.rows[0].pending)).toBe(0);
  });

  test('companies round-trip their fields', async () => {
    await db.execute({
      sql: UPSERT_COMPANY,
      args: ['c1', WS, 'Acme', 'acme.com', 'https://acme.com', null, null, 'Software', 'Berlin', 0, 0, 1000, 1000, null] as never[]
    });
    const rows = await db.execute(`SELECT * FROM companies WHERE id = 'c1'`);
    expect(rows.rows[0].name).toBe('Acme');
    expect(rows.rows[0].domain).toBe('acme.com');
    expect(rows.rows[0].industry).toBe('Software');
  });
});

describe('tenancy', () => {
  test('a query never returns another workspace’s rows', async () => {
    await db.execute({ sql: UPSERT_PERSON, args: person('mine', { name: 'Mine' }) });
    const theirs = person('theirs', { name: 'Theirs' });
    theirs[1] = OTHER as never;
    await db.execute({ sql: UPSERT_PERSON, args: theirs });

    const { sql, args } = peopleQuery({});
    const rows = await db.execute({ sql, args: [WS, ...args] as never[] });

    // The mobile analogue of the server's Scope. Switching workspace must not
    // paint the previous tenant's records, which is the same failure PURGE_API
    // prevents on the web.
    expect(rows.rows.map((r) => String(r.name))).toEqual(['Mine']);
  });

  test('companies are scoped too', async () => {
    await db.execute({
      sql: UPSERT_COMPANY,
      args: ['c1', WS, 'Mine', null, null, null, null, null, null, 0, 0, 1, 1, null] as never[]
    });
    await db.execute({
      sql: UPSERT_COMPANY,
      args: ['c2', OTHER, 'Theirs', null, null, null, null, null, null, 0, 0, 1, 1, null] as never[]
    });

    const { sql, args } = companiesQuery({});
    const rows = await db.execute({ sql, args: [WS, ...args] as never[] });
    expect(rows.rows.map((r) => String(r.name))).toEqual(['Mine']);
  });
});

describe('filters', () => {
  beforeEach(async () => {
    await db.execute({ sql: UPSERT_PERSON, args: person('a', { name: 'Ada', createdAt: 3 }) });
    await db.execute({
      sql: UPSERT_PERSON,
      args: person('b', { name: 'Grace', createdAt: 2, isFavorite: 1 })
    });
    await db.execute({
      sql: UPSERT_PERSON,
      args: person('c', { name: 'Alan', createdAt: 1, isArchived: 1 })
    });
  });

  const run = async (opts: Parameters<typeof peopleQuery>[0]) => {
    const { sql, args } = peopleQuery(opts);
    const rows = await db.execute({ sql, args: [WS, ...args] as never[] });
    return rows.rows.map((r) => String(r.name));
  };

  test('archived rows are hidden by default and shown on request', async () => {
    expect(await run({})).toEqual(['Ada', 'Grace']);
    expect(await run({ archived: true })).toEqual(['Alan']);
  });

  test('favourites narrow, and stay inside the archived rule', async () => {
    expect(await run({ favorite: true })).toEqual(['Grace']);
  });

  test('search matches name, company and email', async () => {
    await db.execute({
      sql: UPSERT_PERSON,
      args: person('d', { name: 'Zed', companyName: 'Initech', email: 'z@initech.com', createdAt: 0 })
    });
    expect(await run({ q: 'Initech' })).toEqual(['Zed']);
    expect(await run({ q: 'z@init' })).toEqual(['Zed']);
    expect(await run({ q: 'Ada' })).toEqual(['Ada']);
  });

  test('newest first, and the limit is honoured', async () => {
    expect(await run({})).toEqual(['Ada', 'Grace']);
    expect(await run({ limit: 1 })).toEqual(['Ada']);
  });
});

describe('the outbox queries', () => {
  const enqueue = (over: Record<string, unknown> = {}) => {
    const e = {
      id: `ob_${Math.random().toString(36).slice(2)}`,
      createdAt: 1,
      method: 'PATCH',
      path: '/people/p1',
      body: '{}',
      idempotencyKey: 'idem',
      entityTable: 'people',
      entityId: 'p1',
      attempts: 0,
      nextAttemptAt: 0,
      state: 'pending',
      ...over
    };
    return db.execute({
      sql: `INSERT INTO outbox
              (id, workspace_id, created_at, method, path, body, idempotency_key,
               entity_table, entity_id, prev, attempts, next_attempt_at, state)
            VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?)`,
      args: [
        e.id, WS, e.createdAt, e.method, e.path, e.body, e.idempotencyKey,
        e.entityTable, e.entityId, e.attempts, e.nextAttemptAt, e.state
      ] as never[]
    });
  };

  test('sends oldest first', async () => {
    await enqueue({ id: 'second', createdAt: 20 });
    await enqueue({ id: 'first', createdAt: 10 });

    const rows = await db.execute({ sql: NEXT_OUTBOX_ENTRY, args: [999] as never[] });
    // FIFO is what keeps two edits to one row resolving in the order they were
    // made rather than the order they happened to arrive.
    expect(rows.rows[0].id).toBe('first');
  });

  test('skips an entry still inside its backoff', async () => {
    await enqueue({ id: 'waiting', nextAttemptAt: 5_000 });
    const early = await db.execute({ sql: NEXT_OUTBOX_ENTRY, args: [1_000] as never[] });
    expect(early.rows).toHaveLength(0);

    const later = await db.execute({ sql: NEXT_OUTBOX_ENTRY, args: [9_000] as never[] });
    expect(later.rows[0].id).toBe('waiting');
  });

  test('skips entries that have failed for good', async () => {
    await enqueue({ id: 'dead', state: 'failed' });
    const rows = await db.execute({ sql: NEXT_OUTBOX_ENTRY, args: [999] as never[] });
    expect(rows.rows).toHaveLength(0);
  });

  test('coalescing finds only an unattempted PATCH for the same row', async () => {
    await enqueue({ id: 'attempted', attempts: 2 });
    const attempted = await db.execute({
      sql: COALESCE_TARGET,
      args: ['people', 'p1'] as never[]
    });
    // Merging into something already in flight would change a body the server
    // is part-way through reading.
    expect(attempted.rows).toHaveLength(0);

    await enqueue({ id: 'fresh', createdAt: 30 });
    const fresh = await db.execute({ sql: COALESCE_TARGET, args: ['people', 'p1'] as never[] });
    expect(fresh.rows[0].id).toBe('fresh');
  });

  test('coalescing does not reach across rows', async () => {
    await enqueue({ id: 'other-row', entityId: 'p2' });
    const rows = await db.execute({ sql: COALESCE_TARGET, args: ['people', 'p1'] as never[] });
    expect(rows.rows).toHaveLength(0);
  });
});
