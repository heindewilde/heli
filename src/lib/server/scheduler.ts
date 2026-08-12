import { createId } from '@paralleldrive/cuid2';
import type { Client } from '@libsql/client';
import { client as getClient, allRegionUrls } from './db';
import { calendarFeeds } from './schema';
import { db } from './db';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { requireScope, type Scope } from './scope';
import { MIN_REFRESH_MS, syncFeed, type CalendarFeed } from './calendar';
import { pushTick } from './push';

/**
 * The smallest correct background loop.
 *
 * Calendar sync cannot ride on a page visit: that would put a blocking network
 * call inside a page load, and would do nothing at all while you are away —
 * which is exactly when a calendar changes. So: one interval, and a lease so
 * that N server processes do not all sync the same feed N times.
 *
 * The lease lives in `schema_meta`, the table migrate.ts already calls "the
 * version tracking this migrator otherwise lacks". No new table for one row.
 *
 * Correctness across regions: each region's feeds live in that region's
 * database, so each region needs its own winner. Every process attempts every
 * region's lease and does the work for whichever it wins. That is correct at
 * one machine in `ams` today and stays correct at N.
 */

const TICK_MS = 60_000;
const LEASE_KEY = 'scheduler_lease';
const LEASE_TTL_MS = 5 * 60_000;
const MAX_FEEDS_PER_TICK = 5;

/** Identifies this process for the lifetime of the process. */
const SELF = createId();

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Take or renew the lease for one database.
 *
 * A single conditional UPDATE, so two processes racing cannot both win: SQLite
 * serialises writes, and `rowsAffected` tells the loser it lost.
 */
async function acquire(c: Client, now: number): Promise<boolean> {
  await c.execute({
    sql: `INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)`,
    args: [LEASE_KEY, `none:0`]
  });
  const res = await c.execute({
    sql: `UPDATE schema_meta
             SET value = ? || ':' || ?
           WHERE key = ?
             AND (CAST(substr(value, instr(value, ':') + 1) AS INTEGER) < ?
                  OR substr(value, 1, instr(value, ':') - 1) = ?)`,
    args: [SELF, String(now + LEASE_TTL_MS), LEASE_KEY, now, SELF]
  });
  return res.rowsAffected === 1;
}

/** Feeds that are enabled and have not been polled inside the refresh window. */
async function dueFeeds(region: string, now: number): Promise<CalendarFeed[]> {
  const cutoff = now - MIN_REFRESH_MS;
  return db(region)
    .select()
    .from(calendarFeeds)
    .where(
      and(
        eq(calendarFeeds.enabled, 1),
        or(isNull(calendarFeeds.lastFetchedAt), lt(calendarFeeds.lastFetchedAt, cutoff))
      )
    )
    .limit(MAX_FEEDS_PER_TICK);
}

/**
 * A feed row already names its workspace, user and region — everything a Scope
 * needs. Minting it through `requireScope` keeps the brand honest rather than
 * casting an object literal into one.
 */
function scopeForFeed(feed: CalendarFeed, region: string): Scope {
  return requireScope({
    user: {
      id: feed.userId,
      email: '',
      username: null,
      region,
      workspaceId: feed.workspaceId,
      workspaceName: '',
      // Sync writes interactions, which any member may create. It never calls
      // requireRole, so the least-privileged role is the honest one here.
      role: 'member'
    },
    sessionId: null,
    token: null
  });
}

export async function runOnce(): Promise<{ region: string; synced: number }[]> {
  const now = Date.now();
  const out: { region: string; synced: number }[] = [];
  const seen = new Set<string>();

  for (const [region, url] of allRegionUrls()) {
    if (seen.has(url)) continue;
    seen.add(url);
    const lower = region.toLowerCase();
    const c = getClient(region);

    let held = false;
    try {
      held = await acquire(c, now);
    } catch {
      // A database that is down must not take the whole loop with it.
      continue;
    }
    if (!held) continue;

    let synced = 0;
    try {
      for (const feed of await dueFeeds(lower, now)) {
        try {
          await syncFeed(scopeForFeed(feed, lower), feed);
          synced++;
        } catch (err) {
          // syncFeed records its own failure on the row; this is only here so
          // one bad feed cannot stop the others.
          console.error('[scheduler] feed sync failed', (err as Error).message);
        }
      }
    } catch (err) {
      console.error('[scheduler] tick failed', (err as Error).message);
    }

    // Due reminders, under the same lease. Bounded and batched deliberately:
    // this shares the tick's single `running` guard, so an unbounded sweep or a
    // request per reminder would hold calendar sync behind it.
    try {
      await pushTick(lower, now);
    } catch (err) {
      console.error('[scheduler] push tick failed', (err as Error).message);
    }

    out.push({ region: lower, synced });
  }

  return out;
}

export function startScheduler(): void {
  if (timer) return;
  if (process.env.SCHEDULER_DISABLED === '1') {
    console.log('[scheduler] disabled by SCHEDULER_DISABLED=1');
    return;
  }

  const tick = async () => {
    // Overlap guard: a slow sync must not have a second tick start on top of it.
    if (running) return;
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }
  };

  // Jittered first run so a rolling deploy does not have every new instance
  // hit the databases at the same instant.
  const jitter = Math.floor(Math.random() * 30_000);
  setTimeout(tick, jitter);
  timer = setInterval(tick, TICK_MS);
  // Never hold the process open on its own account.
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
