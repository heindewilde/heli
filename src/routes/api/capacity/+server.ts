import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { jsonWithEtag } from '$lib/server/cache';
import { capacityWindow, DEFAULT_WEEKS } from '$lib/server/capacity';
import { weekStart } from '$lib/weeks';

/**
 * The availability window as JSON.
 *
 * Read-only and per-user, so it goes through `jsonWithEtag` like every other
 * authed GET — the payload changes only when someone edits an allocation, and
 * a 304 is most of what this endpoint should ever return.
 */
export const GET: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const weeksParam = Number(url.searchParams.get('weeks'));
  const fromParam = url.searchParams.get('from');
  const from = fromParam ? weekStart(Date.parse(fromParam)) : weekStart(Date.now());

  const window = await capacityWindow(s, {
    from: Number.isFinite(from) ? from : undefined,
    weeks: Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : DEFAULT_WEEKS
  });
  return jsonWithEtag(request, window);
};
