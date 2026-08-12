type Bucket = { times: number[]; lastSeen: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type Limit = { name: string; max: number; windowMs: number };

export const LIMITS: Record<string, Limit> = {
  register: { name: 'register', max: 5, windowMs: 60 * 60 * 1000 },
  login: { name: 'login', max: 10, windowMs: 15 * 60 * 1000 },
  save: { name: 'save', max: 30, windowMs: 5 * 60 * 1000 },
  // Broad cap on authenticated API calls per user: 300 req/min.
  // Prevents bulk enumeration or resource exhaustion from a compromised session.
  api: { name: 'api', max: 300, windowMs: 60 * 1000 },
  // Keyed by workspace, not user — invite spam is workspace-level abuse, and
  // every invite can send an email that costs money.
  invite: { name: 'invite', max: 20, windowMs: 60 * 60 * 1000 },
  // Keyed by user: creating a workspace is a per-person act, unlike invites.
  // This is only the fast bound — the buckets live in memory and reset on every
  // deploy, so MAX_OWNED_WORKSPACES is the durable cap.
  workspace: { name: 'workspace', max: 5, windowMs: 60 * 60 * 1000 },
  // Keyed by *token id*, not user: a leaked token should be throttleable
  // without locking its owner's browser session out of the app.
  apiToken: { name: 'api_token', max: 120, windowMs: 60 * 1000 },
  apiTokenWrite: { name: 'api_token_write', max: 30, windowMs: 60 * 1000 },
  // Keyed by *device id*, and deliberately looser than the token limits above.
  // A token is a script, where a runaway loop is the thing to catch. A device is
  // one person's app: opening it after a week offline replays an outbox and
  // fetches several lists at once, which is a legitimate burst rather than
  // abuse. Keying by device means one phone can never throttle its owner's
  // browser session or their other phone.
  device: { name: 'device', max: 600, windowMs: 60 * 1000 },
  deviceWrite: { name: 'device_write', max: 120, windowMs: 60 * 1000 },
  // Minting a pairing code is a deliberate human act; keyed by user.
  devicePair: { name: 'device_pair', max: 10, windowMs: 60 * 60 * 1000 },
  // Claiming is unauthenticated, so this is the only thing standing between a
  // guessed code and a credential. Keyed by IP, same shape as `login`. Ten
  // attempts per quarter-hour against 50 bits of entropy inside a 120s window
  // is not a guessing game worth playing.
  deviceClaim: { name: 'device_claim', max: 10, windowMs: 15 * 60 * 1000 }
};

/**
 * `gc` runs on every call, so both bounds below exist to keep it O(1) in the
 * common case and amortised in the bad one.
 *
 * `GC_TRIGGER` is above `MAX_KEYS` and `TARGET_KEYS` is below it, deliberately.
 * With a single threshold the map settled at exactly `MAX_KEYS`, so the next
 * request pushed it one over, sorted all 5,001 entries to evict exactly one, and
 * the request after that did it again — a permanent per-request O(n log n) plus
 * a 5,001-element allocation for as long as the box stayed busy. Sweeping down
 * to a target well under the trigger buys ~500 quiet requests per sweep.
 */
const GC_TRIGGER = Math.floor(MAX_KEYS * 1.1);
const TARGET_KEYS = Math.floor(MAX_KEYS * 0.9);

function gc() {
  if (buckets.size <= GC_TRIGGER) return;
  const now = Date.now();
  const stale = now - 60 * 60 * 1000;
  for (const [k, b] of buckets) {
    if (b.lastSeen < stale) buckets.delete(k);
  }
  if (buckets.size <= TARGET_KEYS) return;
  // Still over: drop oldest by lastSeen down to the target, not to the trigger.
  const sorted = [...buckets.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [k] of sorted) {
    if (buckets.size <= TARGET_KEYS) break;
    buckets.delete(k);
  }
}

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('rate_limited');
    this.retryAfterMs = retryAfterMs;
  }
}

// Safely resolves getClientAddress(), falling back to 'unknown' when the
// expected address header (e.g. CF-Connecting-IP) is absent. Requests that
// lack the header share one 'unknown' bucket, which is an acceptable fallback.
export function safeClientAddress(fn: () => string): string {
  try { return fn(); } catch { return 'unknown'; }
}

export function checkRateLimit(limit: Limit, key: string): void {
  const now = Date.now();
  const cutoff = now - limit.windowMs;
  const fullKey = `${limit.name}:${key}`;
  let b = buckets.get(fullKey);
  if (!b) {
    b = { times: [], lastSeen: now };
    buckets.set(fullKey, b);
  }
  // Drop expired timestamps in-place.
  b.times = b.times.filter((t) => t > cutoff);
  if (b.times.length >= limit.max) {
    const oldest = b.times[0];
    throw new RateLimitError(oldest + limit.windowMs - now);
  }
  b.times.push(now);
  b.lastSeen = now;
  gc();
}
