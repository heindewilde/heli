import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createEntry, listTimeEntries, getRunningEntry } from '$lib/server/time';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Tracked time.
 *
 * This is the surface the mobile app exists for most obviously:
 * `time_entries.ended_at IS NULL` *is* the running timer, with no separate
 * table and no flag, which is precisely what lets you start on a laptop and
 * stop on a phone. `running` is returned alongside the list so a client gets
 * both in one round trip rather than opening a screen and then discovering a
 * clock is going.
 */

const MAX_LIMIT = 500;

function num(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const userParam = url.searchParams.get('user');
  const billable = url.searchParams.get('billable');

  const [items, running] = await Promise.all([
    listTimeEntries(s, {
      // Defaults to the caller — "my time" is the question a phone asks.
      userId: userParam === 'all' ? 'all' : (userParam ?? undefined),
      projectId: url.searchParams.get('project') ?? undefined,
      from: num(url.searchParams.get('from')),
      to: num(url.searchParams.get('to')),
      billable: billable === null || billable === '' ? undefined : billable === '1',
      limit: Math.min(Number(url.searchParams.get('limit')) || 200, MAX_LIMIT)
    }),
    getRunningEntry(s)
  ]);

  return apiOk({ items, running });
};

/** Backfill an entry that has already happened. The timer is `/time/start`. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      const created = await createEntry(s, body as never);
      return apiOk(created, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'not_found') return apiError('not_found', 'No such project.', 404);
      return apiError('invalid_request', msg, 400);
    }
  });
};
