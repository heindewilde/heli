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
  workspace: { name: 'workspace', max: 5, windowMs: 60 * 60 * 1000 }
};

function gc() {
  if (buckets.size <= MAX_KEYS) return;
  const now = Date.now();
  const stale = now - 60 * 60 * 1000;
  for (const [k, b] of buckets) {
    if (b.lastSeen < stale) buckets.delete(k);
  }
  if (buckets.size <= MAX_KEYS) return;
  // Still over: drop oldest by lastSeen until under threshold.
  const sorted = [...buckets.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [k] of sorted) {
    if (buckets.size <= MAX_KEYS) break;
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
