import { describe, expect, test } from 'vitest';
import {
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  isLocalId,
  isRetryable,
  mergePatch,
  newLocalId,
  retryDelay,
  rollbackFields
} from '../mobile/src/db/replay-policy';

/**
 * The mobile outbox's decisions, tested from the app's own runner.
 *
 * `mobile/` cannot be type-checked by `npm run check` — that is the cost of the
 * isolation MOBILE.md describes — but a module with no Expo imports can be
 * imported from `tests/` and covered here, exactly as the browser extension's
 * adapters are. So the rules that decide whether somebody's offline work
 * survives are verified on every `npm run check`, on a laptop, with no device
 * involved.
 *
 * Everything below is a property where being wrong loses work or hammers a
 * server.
 */

describe('what gets retried', () => {
  test('a rejected request is not retried', () => {
    // The server has decided, and will decide the same way again. Replaying it
    // never converges; it gets surfaced instead.
    expect(isRetryable({ code: 'invalid_request', status: 400 })).toBe(false);
    expect(isRetryable({ code: 'forbidden', status: 403 })).toBe(false);
    expect(isRetryable({ code: 'not_found', status: 404 })).toBe(false);
  });

  test('a temporary condition is retried, including the 4xx ones', () => {
    expect(isRetryable({ code: 'offline', status: 0 })).toBe(true);
    expect(isRetryable({ code: 'server_error', status: 500 })).toBe(true);
    expect(isRetryable({ code: 'server_error', status: 503 })).toBe(true);
    // The two 4xx codes that describe a temporary state rather than a refusal.
    expect(isRetryable({ code: 'rate_limited', status: 429 })).toBe(true);
    expect(isRetryable({ code: 'invalid_request', status: 408 })).toBe(true);
  });

  test('unauthorized is terminal here, because the client already handled it', () => {
    // A 401 wipes the credential and routes to pairing; retrying it would just
    // fail again against a token that no longer exists.
    expect(isRetryable({ code: 'unauthorized', status: 401 })).toBe(false);
  });
});

describe('backoff', () => {
  test('grows exponentially from one minute', () => {
    expect(retryDelay(1)).toBe(BASE_DELAY_MS);
    expect(retryDelay(2)).toBe(BASE_DELAY_MS * 2);
    expect(retryDelay(3)).toBe(BASE_DELAY_MS * 4);
  });

  test('caps at an hour, however long the phone was away', () => {
    // A week in a drawer must not produce a backoff measured in days: the user
    // can see the work is pending and expects it to go when the signal returns.
    expect(retryDelay(20)).toBe(MAX_DELAY_MS);
    expect(retryDelay(9999)).toBe(MAX_DELAY_MS);
  });

  test('never returns zero, whatever it is handed', () => {
    // A zero delay is a hot loop against a server that is already unhappy.
    for (const n of [0, -1, Number.NaN]) {
      expect(retryDelay(n)).toBeGreaterThanOrEqual(BASE_DELAY_MS);
    }
  });
});

describe('coalescing', () => {
  test('later values win', () => {
    const merged = mergePatch({ is_favorite: 1, role: 'CTO' }, { is_favorite: 0 });
    expect(merged).toEqual({ is_favorite: 0, role: 'CTO' });
  });

  test('a field set back to its original value still sends', () => {
    // Deliberately not optimised away. The queued entry is what the server will
    // be told, and second-guessing it here would mean reasoning about a base
    // state this module cannot see.
    expect(mergePatch({ role: 'CTO' }, { role: null })).toEqual({ role: null });
  });
});

describe('rollback', () => {
  test('restores only what the failed write touched', () => {
    const before = { role: 'CTO', email: 'a@example.com', phone: null };
    const attempted = { role: 'Founder' };
    // Restoring the whole row would undo a later, successful edit to `email` —
    // a rollback that loses work is worse than the failure it is cleaning up.
    expect(rollbackFields(before, attempted)).toEqual({ role: 'CTO' });
  });

  test('ignores fields the snapshot never captured', () => {
    expect(rollbackFields({ role: 'CTO' }, { role: 'x', name: 'y' })).toEqual({ role: 'CTO' });
  });

  test('restores a null rather than skipping it', () => {
    // `null` is a real previous value — "this had no phone number" — and
    // skipping falsy values would leave the optimistic one in place forever.
    expect(rollbackFields({ phone: null }, { phone: '+31' })).toEqual({ phone: null });
  });
});

describe('local ids', () => {
  test('are recognisable, which is what makes the id swap findable', () => {
    expect(isLocalId(newLocalId(Date.now(), 1))).toBe(true);
    // A server cuid2 must never be mistaken for one.
    expect(isLocalId('cx7znztf89r279paelds7fd5')).toBe(false);
  });

  test('are unique within a millisecond', () => {
    const now = Date.now();
    // Two interactions logged in the same tick — a double-tap, or a queue
    // replaying — must not collide on the primary key.
    expect(newLocalId(now, 1)).not.toBe(newLocalId(now, 2));
  });
});
