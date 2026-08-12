import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import {
  capacityWindow,
  projectTimeline,
  weekDetail,
  DEFAULT_WEEKS
} from '$lib/server/capacity';
import { weekStart } from '$lib/weeks';

export type AvailabilityView = 'grid' | 'week' | 'projects';

function isView(v: string | null): v is AvailabilityView {
  return v === 'grid' || v === 'week' || v === 'projects';
}

/**
 * Three views over the same commitments, and each fetches only its own data —
 * a grid load should not pay for a timeline nobody is looking at.
 *
 * The window lives in the URL so a view is linkable; "here is our March" is a
 * thing you send someone.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const viewParam = url.searchParams.get('view');
  const view: AvailabilityView = isView(viewParam) ? viewParam : 'grid';

  if (!locals.user) {
    return {
      view,
      window: null,
      week: null,
      timeline: null,
      from: Date.now(),
      weekCount: DEFAULT_WEEKS
    };
  }
  const s = requireScope(locals);

  const weeksParam = Number(url.searchParams.get('weeks'));
  const fromParam = url.searchParams.get('from');
  // Snap to a Monday: a window starting mid-week would put the same allocation
  // in different columns depending on when the page was loaded.
  const parsed = fromParam ? Date.parse(fromParam) : Date.now();
  const from = weekStart(Number.isFinite(parsed) ? parsed : Date.now());
  const weeks =
    Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : DEFAULT_WEEKS;

  if (view === 'week') {
    return {
      view,
      window: null,
      timeline: null,
      week: await weekDetail(s, from),
      from,
      weekCount: weeks
    };
  }

  if (view === 'projects') {
    return {
      view,
      window: null,
      week: null,
      timeline: await projectTimeline(s, { from, weeks }),
      from,
      weekCount: weeks
    };
  }

  return {
    view,
    week: null,
    timeline: null,
    window: await capacityWindow(s, { from, weeks }),
    from,
    weekCount: weeks
  };
};
