import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import { capacityWindow, DEFAULT_WEEKS } from '$lib/server/capacity';
import { weekStart } from '$lib/weeks';

/**
 * The window lives in the URL so a view is linkable — "here is our March" is a
 * thing you send someone.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    return { window: { weeks: [], rows: [], from: Date.now(), weekCount: DEFAULT_WEEKS } };
  }
  const s = requireScope(locals);

  const weeksParam = Number(url.searchParams.get('weeks'));
  const fromParam = url.searchParams.get('from');
  // Snap to a Monday: a window starting mid-week would put the same allocation
  // in different columns depending on when you loaded the page.
  const from = fromParam ? weekStart(Date.parse(fromParam)) : weekStart(Date.now());

  return {
    window: await capacityWindow(s, {
      from: Number.isFinite(from) ? from : undefined,
      weeks: Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : DEFAULT_WEEKS
    })
  };
};
