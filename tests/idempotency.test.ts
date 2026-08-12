import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Replay safety for offline clients.
 *
 * The case that matters is the ambiguous one: the write arrived and was
 * applied, the response never came back, and the client cannot tell that from a
 * write that never landed. Retrying is the only correct thing it can do, so the
 * server has to make retrying safe.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('idem-alice');
  bob = await makeTenant('idem-bob');
}, 120_000);

afterAll(() => ctx?.cleanup());

const ok = (body: unknown, status = 201) =>
  new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' }
  });

describe('withIdempotency', () => {
  test('runs the handler once and replays the stored response', async () => {
    const { withIdempotency } = await import('../src/lib/server/idempotency');
    let runs = 0;
    const handler = async () => {
      runs++;
      return ok({ id: `run-${runs}` });
    };

    const first = await withIdempotency(alice.scope, 'key-alpha', handler);
    const second = await withIdempotency(alice.scope, 'key-alpha', handler);

    expect(runs).toBe(1);
    expect(await first.json()).toEqual({ data: { id: 'run-1' } });
    // Byte-identical, so a retry is indistinguishable from the original.
    expect(await second.json()).toEqual({ data: { id: 'run-1' } });
    expect(second.headers.get('Idempotent-Replay')).toBe('true');
  });

  test('no key means no memory', async () => {
    const { withIdempotency } = await import('../src/lib/server/idempotency');
    let runs = 0;
    const handler = async () => {
      runs++;
      return ok({ id: runs });
    };
    await withIdempotency(alice.scope, null, handler);
    await withIdempotency(alice.scope, null, handler);
    expect(runs).toBe(2);
  });

  test('a key is scoped to its workspace', async () => {
    const { withIdempotency } = await import('../src/lib/server/idempotency');
    await withIdempotency(alice.scope, 'shared-key', async () => ok({ secret: "alice's" }));

    let ran = false;
    const res = await withIdempotency(bob.scope, 'shared-key', async () => {
      ran = true;
      return ok({ secret: "bob's" });
    });

    // Bob must never see Alice's stored body, whether the key was guessed or
    // simply reused by the same client after switching workspace.
    expect(ran).toBe(true);
    expect(await res.json()).toEqual({ data: { secret: "bob's" } });
  });

  test('failures are not remembered', async () => {
    const { withIdempotency } = await import('../src/lib/server/idempotency');
    let runs = 0;
    const failing = async () => {
      runs++;
      return new Response(JSON.stringify({ error: { code: 'server_error', message: 'boom' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    };

    await withIdempotency(alice.scope, 'flaky-key', failing);
    await withIdempotency(alice.scope, 'flaky-key', failing);

    // Caching a 5xx would make a transient fault permanent — the exact thing a
    // retry is supposed to fix. Same argument for a 4xx the client may have
    // since corrected.
    expect(runs).toBe(2);
  });

  test('keys are stored hashed, not in plaintext', async () => {
    const { withIdempotency } = await import('../src/lib/server/idempotency');
    await withIdempotency(alice.scope, 'a-recognisable-key', async () => ok({ ok: true }));
    const rows = await ctx.client.execute({
      sql: `SELECT key_hash FROM idempotency_keys`,
      args: []
    });
    for (const r of rows.rows) {
      expect(String(r.key_hash)).toMatch(/^[0-9a-f]{64}$/);
      expect(String(r.key_hash)).not.toContain('a-recognisable-key');
    }
  });

  test('the header is only honoured at a plausible length', async () => {
    const { idempotencyKeyFrom } = await import('../src/lib/server/idempotency');
    const withHeader = (v: string) =>
      idempotencyKeyFrom(new Request('https://x.test', { headers: { 'idempotency-key': v } }));

    expect(withHeader('short')).toBeNull();
    expect(withHeader('a'.repeat(8))).toBe('a'.repeat(8));
    // Not a place to stash a payload.
    expect(withHeader('a'.repeat(201))).toBeNull();
    expect(idempotencyKeyFrom(new Request('https://x.test'))).toBeNull();
  });
});

describe('tenancy classification', () => {
  test('idempotency_keys is not a tenant table', async () => {
    const { TENANT_TABLES, PERSONAL_TABLES } = await import('../src/lib/server/migrate');
    // It holds a cached response, not CRM data, and is swept by age rather than
    // by ownership. Adding it would put it in the backfill and in
    // reassignAuthorship, neither of which means anything here.
    expect(TENANT_TABLES as readonly string[]).not.toContain('idempotency_keys');
    expect(PERSONAL_TABLES).not.toContain('idempotency_keys');
  });
});
