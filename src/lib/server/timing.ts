import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request database timing, for the `Server-Timing` header.
 *
 * The point is to answer one question before optimising anything: on a given
 * page load, is the time going into libSQL round trips or into rendering? In
 * the cloud deployment the database is remote, so the honest guess is round
 * trips — but "fewer queries per load" and "more caching" are very different
 * pieces of work, and guessing wrong wastes the phase.
 *
 * AsyncLocalStorage because the db client is a module singleton shared by every
 * concurrent request; a plain accumulator would mix tenants' timings together.
 */

type Bucket = { db: number; queries: number };

const store = new AsyncLocalStorage<Bucket>();

export function withTiming<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({ db: 0, queries: 0 }, fn);
}

export function current(): Bucket | undefined {
  return store.getStore();
}

/**
 * Wrap one database call, adding its duration to the current request's bucket.
 *
 * Note this sums durations rather than measuring wall-clock, so a page that
 * awaits several queries concurrently can report `db` greater than `total`.
 * That is the useful reading: it is the work done, and on a remote database it
 * is what a serial rewrite would cost.
 */
export async function timed<T>(fn: () => Promise<T>): Promise<T> {
  const bucket = store.getStore();
  if (!bucket) return fn();
  const started = performance.now();
  try {
    return await fn();
  } finally {
    bucket.db += performance.now() - started;
    bucket.queries++;
  }
}
