/**
 * A bounded worker pool for background enrichment.
 *
 * Every `savePerson`/`saveCompany` against a URL used to end in a bare
 * `void enrichPerson(...)`, and each of those is one or two outbound fetches
 * with a 10-second timeout (`fetchGuarded`, and `enrichPerson` may follow a
 * JSON-LD `worksFor.url` to a second page). One at a time that is invisible.
 * Bulk-importing 500 pasted URLs from one handler would fire up to a thousand
 * simultaneously — against a 1 GB VPS, and against whoever's servers are on the
 * other end.
 *
 * So the fire-and-forget stays fire-and-forget from the caller's point of view;
 * it is only *paced* here. Wiring it inside `savePerson`/`saveCompany` rather
 * than at the bulk-import call site means the extension capture, the
 * bookmarklet and `/api/v1/people` are paced by the same change, and no caller
 * has to know the queue exists.
 *
 * Deliberately in-process and unpersisted, the same stance as the import
 * staging map. A job lost to a restart leaves its row on `source = 'parsing'`,
 * which is exactly the state the boot janitor in `migrate.ts` already sweeps
 * after ten minutes — so the failure mode is one that is already handled rather
 * than a new one.
 */

type Job = () => Promise<void>;

/**
 * Concurrent enrichments per process. Four is a compromise: enough that a
 * hundred pasted URLs finish in a couple of minutes, few enough that a small
 * self-host box is not holding four megabyte-capped response buffers plus its
 * own request traffic. Tunable because a 1 GB VPS may want fewer, in the same
 * spirit as `SQLITE_CACHE_MB`.
 */
const MAX = Math.max(1, Number(process.env.ENRICH_CONCURRENCY ?? 4) || 4);

/**
 * A backstop, not a product limit. The queue holds closures, so the memory cost
 * is small, but an unbounded queue turns a runaway caller into a process that
 * never catches up. Dropping is safe: the row stays `parsing` and the janitor
 * clears it, which is the same outcome as a restart mid-drain.
 */
const MAX_QUEUED = 2000;

/**
 * Two lanes, drained urgent-first.
 *
 * Without them a bulk import of 500 URLs would sit in front of every ordinary
 * save: paste a link in the sidebar while the drain is running and its spinner
 * would spin for minutes for no reason the user can see. An interactive save
 * now waits at most for the four jobs in flight.
 *
 * FIFO within each lane, so a paste of twenty links still resolves in order.
 */
const urgent: Job[] = [];
const bulk: Job[] = [];
let active = 0;
let dropped = 0;

export type Lane = 'now' | 'bulk';

function pump(): void {
  while (active < MAX && (urgent.length > 0 || bulk.length > 0)) {
    const job = (urgent.length > 0 ? urgent.shift() : bulk.shift())!;
    active += 1;
    // Every enrichment already swallows its own failures and unsticks its row;
    // this catch is here so that one that somehow throws synchronously-adjacent
    // cannot leave `active` incremented and stall the pool forever.
    job()
      .catch(() => {})
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

/**
 * Returns false when the queue is full, so a bulk caller can tell the user
 * "n rows saved without enrichment" rather than silently producing rows that
 * never fill in.
 */
export function enqueueEnrichment(job: Job, lane: Lane = 'now'): boolean {
  if (urgent.length + bulk.length >= MAX_QUEUED) {
    dropped += 1;
    return false;
  }
  (lane === 'now' ? urgent : bulk).push(job);
  pump();
  return true;
}

/** Test seam: jobs waiting for a slot. */
export function queueDepth(): number {
  return urgent.length + bulk.length;
}

/** Test seam: jobs currently running. */
export function activeCount(): number {
  return active;
}

/** Test seam: jobs refused because the queue was full. */
export function droppedCount(): number {
  return dropped;
}

/** Test seam: the configured concurrency. */
export function maxConcurrency(): number {
  return MAX;
}
