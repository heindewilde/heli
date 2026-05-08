/**
 * Drives `setInterval` while a predicate is true, capped at a max duration.
 * Returns the cleanup function; pass to a Svelte $effect.
 *
 * Used to surface async enrichment results on detail pages and the dashboard:
 * the server inserts a stub with source='parsing' and updates the row in the
 * background. The client polls invalidateAll() until source flips back to null
 * (or the cap elapses, whichever comes first).
 */

export type PollOpts = {
  /** Milliseconds between ticks. Default 1500. */
  intervalMs?: number;
  /** Hard ceiling — give up after this much wall time. Default 30000. */
  maxMs?: number;
};

export function pollWhile(
  predicate: () => boolean,
  tick: () => void | Promise<void>,
  opts: PollOpts = {}
): () => void {
  if (!predicate()) return () => {};
  const interval = opts.intervalMs ?? 1500;
  const max = opts.maxMs ?? 30_000;
  const startedAt = Date.now();
  const id = setInterval(() => {
    if (!predicate() || Date.now() - startedAt > max) {
      clearInterval(id);
      return;
    }
    void tick();
  }, interval);
  return () => clearInterval(id);
}
