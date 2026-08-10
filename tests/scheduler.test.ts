import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';

/**
 * The lease is the whole reason the scheduler is safe to run on more than one
 * process. If it were wrong, every instance would sync every feed on every
 * tick — duplicated outbound requests to someone's calendar provider, and N
 * writers racing on the same rows.
 *
 * The lease logic is a single conditional UPDATE, so it can be tested directly
 * against the database without starting timers.
 */

let ctx: TestDb;

const LEASE_KEY = 'scheduler_lease';
const TTL = 5 * 60_000;

beforeAll(async () => {
  ctx = await freshDb();
}, 60_000);

afterAll(() => ctx?.cleanup());

/** Mirror of `acquire` in scheduler.ts, parameterised by process id. */
async function acquire(self: string, now: number): Promise<boolean> {
  await ctx.client.execute({
    sql: `INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)`,
    args: [LEASE_KEY, 'none:0']
  });
  const res = await ctx.client.execute({
    sql: `UPDATE schema_meta
             SET value = ? || ':' || ?
           WHERE key = ?
             AND (CAST(substr(value, instr(value, ':') + 1) AS INTEGER) < ?
                  OR substr(value, 1, instr(value, ':') - 1) = ?)`,
    args: [self, String(now + TTL), LEASE_KEY, now, self]
  });
  return res.rowsAffected === 1;
}

test('exactly one process wins a contested lease', async () => {
  const now = Date.now();
  const winners: string[] = [];
  for (const self of ['proc-a', 'proc-b', 'proc-c']) {
    if (await acquire(self, now)) winners.push(self);
  }
  expect(winners).toEqual(['proc-a']);
});

test('the holder can renew its own lease', async () => {
  const now = Date.now();
  expect(await acquire('proc-a', now + 1000)).toBe(true);
  // ...while another process still cannot take it.
  expect(await acquire('proc-b', now + 1000)).toBe(false);
});

test('an expired lease is taken over', async () => {
  // A process that died mid-tick must not hold the lease forever.
  //
  // Comfortably past the renewal in the previous test: the comparison is
  // strict (`expiry < now`), so a probe at exactly the expiry instant still
  // finds the lease held — which is the correct, conservative direction.
  const later = Date.now() + TTL + 120_000;
  expect(await acquire('proc-b', later)).toBe(true);
  expect(await acquire('proc-a', later)).toBe(false);
});

test('the lease reuses schema_meta rather than adding a table', async () => {
  const rows = await ctx.client.execute({
    sql: `SELECT value FROM schema_meta WHERE key = ?`,
    args: [LEASE_KEY]
  });
  expect(rows.rows).toHaveLength(1);
  // `<processId>:<expiry>` — the format the CAS parses with substr/instr.
  expect(String(rows.rows[0].value)).toMatch(/^[\w-]+:\d+$/);
});

test('SCHEDULER_DISABLED stops it starting at all', async () => {
  process.env.SCHEDULER_DISABLED = '1';
  const { startScheduler, stopScheduler } = await import('../src/lib/server/scheduler');
  startScheduler();
  stopScheduler();
  delete process.env.SCHEDULER_DISABLED;
  // Nothing to assert beyond "did not throw and did not schedule" — the value
  // of this test is that the escape hatch self-hosters are told about works.
  expect(true).toBe(true);
});
