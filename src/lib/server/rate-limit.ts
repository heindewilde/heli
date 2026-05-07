type Bucket = { times: number[]; lastSeen: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type Limit = { name: string; max: number; windowMs: number };

export const LIMITS: Record<string, Limit> = {
  register: { name: 'register', max: 5, windowMs: 60 * 60 * 1000 },
  login: { name: 'login', max: 10, windowMs: 15 * 60 * 1000 },
  save: { name: 'save', max: 30, windowMs: 5 * 60 * 1000 }
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
