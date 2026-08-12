/**
 * The decisions the outbox makes, separated from the database it makes them in.
 *
 * Every rule here is one where getting it wrong loses somebody's work or spams
 * a server, and none of them needs SQLite to be true — so they live in a file
 * with no Expo imports at all, and `tests/outbox-policy.test.ts` in the root
 * suite covers them. That is the same arrangement `tests/extension-*.test.ts`
 * uses to test the browser extension from the app's own runner.
 *
 * Keep this module dependency-free. It is the only reason the rules are
 * testable without a device.
 */

/** Roughly `ApiError`, without importing it — this file stays standalone. */
export type FailureShape = { code: string; status: number };

/**
 * Should this be tried again later?
 *
 * A 4xx is a decision the server has made and will make again: replaying it
 * burns battery and never converges, so it is terminal and gets surfaced. The
 * exceptions are the two 4xx codes that describe a *temporary* condition rather
 * than a rejected request.
 */
export function isRetryable(failure: FailureShape): boolean {
  if (failure.code === 'offline') return true;
  if (failure.code === 'rate_limited' || failure.status === 429) return true;
  // 408 Request Timeout is the server saying "say that again", not "no".
  if (failure.status === 408) return true;
  return failure.status >= 500;
}

/** Milliseconds to wait before attempt number `attempts`. */
export const BASE_DELAY_MS = 60_000;
export const MAX_DELAY_MS = 3_600_000;

/**
 * Exponential, capped at an hour.
 *
 * The cap is the interesting half. Without it, a phone left in a drawer for a
 * week comes back with a backoff measured in days and refuses to send work the
 * user can plainly see is pending; with too small a cap, the same phone hammers
 * a server that may be down for a reason.
 */
export function retryDelay(attempts: number): number {
  // `Math.max(1, NaN)` is NaN, and a NaN deadline makes `next_attempt_at <= ?`
  // false forever — the entry stops being retried and stops being visible as a
  // problem, which is the worst of both. `attempts` comes out of SQLite, so a
  // migration or a hand-edited row is all it would take.
  const n = Number.isFinite(attempts) ? Math.max(1, attempts) : 1;
  return Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
}

/**
 * Merge a new PATCH into one already queued for the same row.
 *
 * Later values win, which is what makes a twenty-tap toggle one request instead
 * of twenty — nineteen of which describe a state the user has already moved on
 * from. Only ever applied to an entry that has not been attempted; merging into
 * a body the server is mid-way through reading would change the request under
 * it.
 */
export function mergePatch(
  queued: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  return { ...queued, ...next };
}

/**
 * Which columns to restore when a write is rejected for good.
 *
 * Only the fields the failed patch actually changed. Restoring a whole row
 * would undo a *later* successful edit that happened to touch a different
 * column — a rollback that quietly loses work is worse than the failure it is
 * cleaning up after.
 */
export function rollbackFields(
  before: Record<string, unknown>,
  attempted: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(attempted)) {
    if (key in before) out[key] = before[key];
  }
  return out;
}

/**
 * Is this a locally-created id, still waiting for the server's?
 *
 * Prefixed rather than a bare cuid on purpose: when offline *person* creation
 * lands, queued entries will need their paths rewritten, and recognising which
 * ids are provisional is how that will find them.
 */
export function isLocalId(id: string): boolean {
  return id.startsWith('local_');
}

export function newLocalId(now: number, seq: number): string {
  return `local_${now.toString(36)}_${seq.toString(36)}`;
}
