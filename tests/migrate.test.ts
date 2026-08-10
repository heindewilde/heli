import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Client } from '@libsql/client';
import { freshDb, type TestDb } from './helpers/testDb';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await freshDb();
}, 60_000);

afterAll(() => ctx?.cleanup());

async function metaValue(c: Client, key: string): Promise<string | null> {
  const res = await c.execute({ sql: `SELECT value FROM schema_meta WHERE key = ?`, args: [key] });
  const v = res.rows[0]?.value;
  return v == null ? null : String(v);
}

/** Record every statement the next `migrate()` sends, then restore the client. */
function recordStatements(c: Client): { seen: string[]; restore: () => void } {
  const seen: string[] = [];
  const realExecute = c.execute.bind(c);
  const realBatch = c.batch.bind(c);
  const note = (stmt: unknown) => {
    if (typeof stmt === 'string') seen.push(stmt);
    else if (stmt && typeof stmt === 'object' && 'sql' in stmt) seen.push(String(stmt.sql));
  };
  c.execute = (stmt, ...rest) => {
    note(stmt);
    // @ts-expect-error — re-dispatching across libSQL's execute() overloads.
    return realExecute(stmt, ...rest);
  };
  c.batch = (stmts, ...rest) => {
    if (Array.isArray(stmts)) stmts.forEach(note);
    return realBatch(stmts, ...rest);
  };
  return {
    seen,
    restore: () => {
      c.execute = realExecute;
      c.batch = realBatch;
    }
  };
}

test('the first migrate records the one-shot fingerprint', async () => {
  expect(await metaValue(ctx.client, 'oneshot_ddl_fingerprint')).toMatch(/^[0-9a-f]{40}$/);
  expect(await metaValue(ctx.client, 'workspace_backfill_v1')).not.toBeNull();
});

test('a second migrate replays no ALTERs, no unique indexes, no drops', async () => {
  const before = await metaValue(ctx.client, 'oneshot_ddl_fingerprint');
  const rec = recordStatements(ctx.client);
  try {
    const { migrate } = await import('../src/lib/server/migrate');
    await migrate();
  } finally {
    rec.restore();
  }

  // This is the whole point of the gate: ~160 sequential round trips that cost
  // ~6s per database against remote libSQL must not happen on every boot.
  const alters = rec.seen.filter((s) => /^\s*ALTER TABLE/i.test(s));
  const uniques = rec.seen.filter((s) => /CREATE UNIQUE INDEX/i.test(s));
  const drops = rec.seen.filter((s) => /^\s*DROP INDEX/i.test(s));

  expect(alters).toEqual([]);
  expect(uniques).toEqual([]);
  expect(drops).toEqual([]);

  // And the fingerprint is stable — a re-run must not rewrite it.
  expect(await metaValue(ctx.client, 'oneshot_ddl_fingerprint')).toBe(before);
});

test('migrate stays idempotent: schema is unchanged after a re-run', async () => {
  const tables = await ctx.client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
  );
  const names = tables.rows.map((r) => String(r.name));
  // Spot-check the tables the rest of the suite depends on rather than pinning
  // the full list, which would turn every new table into a failing test.
  for (const t of ['users', 'workspaces', 'workspace_members', 'people', 'companies', 'interactions', 'reminders', 'schema_meta']) {
    expect(names).toContain(t);
  }

  const { migrate } = await import('../src/lib/server/migrate');
  await migrate();

  const after = await ctx.client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
  );
  expect(after.rows.map((r) => String(r.name))).toEqual(names);
});

test('foreign keys are enforced (the :memory: trap)', async () => {
  const fk = await ctx.client.execute('PRAGMA foreign_keys');
  expect(Number(fk.rows[0]?.foreign_keys)).toBe(1);
});
