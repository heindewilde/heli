import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import {
  getRunningEntry,
  isGroupBy,
  listTimeEntries,
  timeSummary,
  type TimeFilters
} from '$lib/server/time';
import { listProjects } from '$lib/server/projects-query';
import { listMemberCapacities } from '$lib/server/allocations';
import { weekStart, MS_PER_WEEK } from '$lib/weeks';

const EMPTY = {
  entries: [],
  running: null,
  projects: [],
  members: [],
  capacityMinutes: 0,
  summary: null,
  view: 'entries' as const,
  filters: { from: 0, to: 0, userId: 'me', projectId: '', billable: '' }
};

/**
 * One route, two views. A separate `/time/report` would duplicate the filter
 * parsing and the project list for a screen that is the same data grouped
 * differently.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) return EMPTY;
  const s = requireScope(locals);

  const view = url.searchParams.get('view') === 'report' ? 'report' : 'entries';

  // Default range is the current week — the answer to "what have I done" is
  // almost never "since the beginning of time".
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam ? Date.parse(fromParam) : weekStart(Date.now());
  const to = toParam ? Date.parse(toParam) + 86_400_000 : from + MS_PER_WEEK;

  const userParam = url.searchParams.get('user') ?? 'me';
  const projectId = url.searchParams.get('project') ?? '';
  const billableParam = url.searchParams.get('billable') ?? '';

  const filters: TimeFilters = {
    userId: userParam === 'all' ? 'all' : userParam === 'me' ? s.userId : userParam,
    projectId: projectId || undefined,
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined,
    billable: billableParam === '' ? undefined : billableParam === '1'
  };

  const groupParam = url.searchParams.get('group');
  const groupBy = isGroupBy(groupParam) ? groupParam : 'project';
  const roundTo = Number(url.searchParams.get('round')) || 0;

  const [entries, running, projects, members, summary] = await Promise.all([
    listTimeEntries(s, filters),
    getRunningEntry(s),
    listProjects(s, { status: 'active', sort: 'name', limit: 200 }),
    listMemberCapacities(s),
    view === 'report' ? timeSummary(s, filters, { groupBy, roundTo }) : Promise.resolve(null)
  ]);

  return {
    entries,
    running,
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    members: members.map((m) => ({ userId: m.userId, name: m.name })),
    /**
     * The caller's own working week, for the "28h of 32h" reading on the week
     * strip. When looking at everyone, the whole team's capacity is the honest
     * denominator.
     */
    capacityMinutes:
      userParam === 'all'
        ? members.reduce((n, m) => n + m.capacityMinutes, 0)
        : (members.find((m) => m.userId === (userParam === 'me' ? s.userId : userParam))
            ?.capacityMinutes ?? 0),
    summary,
    view,
    filters: {
      from,
      to: to - 86_400_000,
      userId: userParam,
      projectId,
      billable: billableParam
    }
  };
};
