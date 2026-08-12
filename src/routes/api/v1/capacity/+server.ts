import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { capacityWindow } from '$lib/server/capacity';

/**
 * Who is committed to what, week by week.
 *
 * `capacityWindow` is two queries whatever the window size — one for members,
 * one for overlapping allocations — and buckets in JS. That is deliberate and
 * worth not undoing: a per-week or per-member query is what would make a
 * 52-week board slow against remote libSQL.
 *
 * Availability is computed from *commitments* only: not tracked time, not
 * calendar load. Adding either would change what the number means.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const weeks = Number(url.searchParams.get('weeks'));
  const from = Number(url.searchParams.get('from'));
  return apiOk(
    await capacityWindow(s, {
      weeks: Number.isFinite(weeks) ? weeks : undefined,
      from: Number.isFinite(from) ? from : undefined
    })
  );
};
