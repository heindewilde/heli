/**
 * The availability window: members × weeks, with the projects behind each cell.
 *
 * **Two queries, whatever the window size.** One for the members and their
 * capacities, one for every allocation overlapping the whole range; the
 * bucketing into weeks happens in JS. Against remote libSQL each query is a
 * network round trip, so a per-member or per-week query is exactly the thing
 * that would make a 52-week board slow. The arithmetic is cheap and the payload
 * is small — 20 people × 52 weeks is a thousand cells of two numbers.
 *
 * Availability is computed from **project commitments only**. Not tracked time,
 * not calendar load. Those are different questions and mixing them into one
 * number produces something nobody can act on.
 */
import { listAllocationsInRange, listMemberCapacities } from './allocations';
import {
  coveredDays,
  minutesInWeek,
  minutesOnDay,
  weekStart,
  weeksFrom,
  MS_PER_DAY,
  type Week
} from '$lib/weeks';
import type { Scope } from './scope';

/** Anything longer stops being a plan and starts being a guess. */
export const MAX_WEEKS = 52;
export const DEFAULT_WEEKS = 12;

/** Which project statuses count as committed work. Archived plainly does not. */
const COMMITTED_STATUSES = ['active', 'paused'];

export type CellProject = {
  projectId: string;
  projectName: string;
  minutes: number;
};

export type Cell = {
  /** Committed minutes this week, pro-rated across partial weeks. */
  allocated: number;
  /** What makes up that number. Already in the payload, so the drilldown is free. */
  projects: CellProject[];
};

export type CapacityRow = {
  userId: string;
  name: string;
  capacityMinutes: number;
  capacityIsExplicit: boolean;
  cells: Cell[];
  /** Highest single-week load in the window — how the rows are ordered. */
  peakAllocated: number;
};

export type CapacityWindow = {
  weeks: Week[];
  rows: CapacityRow[];
  /** Echoed back so the client renders the window the server actually used. */
  from: number;
  weekCount: number;
};

export type WindowArgs = { from?: number; weeks?: number };

function clampWeeks(n: number | undefined): number {
  if (!Number.isFinite(n) || n == null) return DEFAULT_WEEKS;
  return Math.max(1, Math.min(MAX_WEEKS, Math.floor(n)));
}

export async function capacityWindow(s: Scope, args: WindowArgs = {}): Promise<CapacityWindow> {
  const weekCount = clampWeeks(args.weeks);
  const from = Number.isFinite(args.from) ? (args.from as number) : Date.now();
  const weeks = weeksFrom(from, weekCount);
  const rangeStart = weeks[0].start;
  const rangeEnd = weeks[weeks.length - 1].end;

  const [members, allocations] = await Promise.all([
    listMemberCapacities(s),
    listAllocationsInRange(s, {
      from: rangeStart,
      to: rangeEnd,
      statuses: COMMITTED_STATUSES
    })
  ]);

  // Group once, then walk each member's own allocations rather than the whole
  // list per member — otherwise this is members × allocations × weeks.
  const byAssignee = new Map<string, typeof allocations>();
  for (const a of allocations) {
    const list = byAssignee.get(a.assigneeUserId);
    if (list) list.push(a);
    else byAssignee.set(a.assigneeUserId, [a]);
  }

  const rows: CapacityRow[] = members.map((m) => {
    const mine = byAssignee.get(m.userId) ?? [];
    let peakAllocated = 0;

    const cells: Cell[] = weeks.map((w) => {
      const projects: CellProject[] = [];
      let allocated = 0;
      for (const a of mine) {
        const minutes = minutesInWeek(a, w);
        if (minutes === 0) continue;
        allocated += minutes;
        // Two allocations can name the same project — a ramp-down is written
        // as two rows — so merge rather than push twice.
        const existing = projects.find((p) => p.projectId === a.projectId);
        if (existing) existing.minutes += minutes;
        else projects.push({ projectId: a.projectId, projectName: a.projectName, minutes });
      }
      projects.sort((x, y) => y.minutes - x.minutes);
      if (allocated > peakAllocated) peakAllocated = allocated;
      return { allocated, projects };
    });

    return {
      userId: m.userId,
      name: m.name,
      capacityMinutes: m.capacityMinutes,
      capacityIsExplicit: m.capacityIsExplicit,
      cells,
      peakAllocated
    };
  });

  // Busiest first: the people you cannot promise are the reason to open this
  // page, and an alphabetical list buries them.
  rows.sort((a, b) => b.peakAllocated - a.peakAllocated || a.name.localeCompare(b.name));

  return { weeks, rows, from: rangeStart, weekCount };
}

// ----- One week, day by day -------------------------------------------------

export type DayItem = { projectId: string; projectName: string; minutes: number };

export type DayCell = {
  /** Monday-relative, 0–6. */
  index: number;
  date: number;
  items: DayItem[];
  total: number;
};

export type WeekDetailRow = {
  userId: string;
  name: string;
  capacityMinutes: number;
  days: DayCell[];
  weekTotal: number;
};

export type WeekDetail = {
  week: Week;
  rows: WeekDetailRow[];
};

/**
 * "Tuesday and Thursday on Acme, Friday on Beta" — the week at day resolution.
 *
 * An allocation with no day pattern still has to appear somewhere, and the only
 * honest answer is *every* day it covers, with its weekly hours divided across
 * them. That is why an unpatterned 40h/wk booking reads as 8h on each weekday
 * rather than a lump on Monday: nobody said which days, so no day is special.
 */
export async function weekDetail(s: Scope, at: number): Promise<WeekDetail> {
  const start = weekStart(at);
  const week: Week = { key: '', start, end: start + 7 * MS_PER_DAY };

  const [members, allocations] = await Promise.all([
    listMemberCapacities(s),
    listAllocationsInRange(s, {
      from: week.start,
      to: week.end,
      statuses: COMMITTED_STATUSES
    })
  ]);

  const byAssignee = new Map<string, typeof allocations>();
  for (const a of allocations) {
    const list = byAssignee.get(a.assigneeUserId);
    if (list) list.push(a);
    else byAssignee.set(a.assigneeUserId, [a]);
  }

  const rows: WeekDetailRow[] = members.map((m) => {
    const mine = byAssignee.get(m.userId) ?? [];
    let weekTotal = 0;

    const days: DayCell[] = Array.from({ length: 7 }, (_, i) => {
      const items: DayItem[] = [];
      let total = 0;
      for (const a of mine) {
        if (!coveredDays(a, week).includes(i)) continue;
        const minutes = minutesOnDay(a, week, i);
        if (minutes === 0) continue;
        total += minutes;
        const existing = items.find((it) => it.projectId === a.projectId);
        if (existing) existing.minutes += minutes;
        else items.push({ projectId: a.projectId, projectName: a.projectName, minutes });
      }
      items.sort((x, y) => y.minutes - x.minutes);
      weekTotal += total;
      return { index: i, date: week.start + i * MS_PER_DAY, items, total };
    });

    return {
      userId: m.userId,
      name: m.name,
      capacityMinutes: m.capacityMinutes,
      days,
      weekTotal
    };
  });

  rows.sort((a, b) => b.weekTotal - a.weekTotal || a.name.localeCompare(b.name));
  return { week, rows };
}

// ----- Projects on a timeline ----------------------------------------------

export type TimelineBar = {
  projectId: string;
  projectName: string;
  status: string;
  startDate: number;
  endDate: number;
  minutesPerWeek: number;
  people: { userId: string; name: string; minutesPerWeek: number }[];
};

/**
 * Rows are projects, spanning their booked range — the engagement schedule
 * rather than the people.
 *
 * The bar is the union of a project's allocations, not `projects.start_date`:
 * a project can be dated long before anyone is booked on it, and what this view
 * is about is when work is actually committed.
 */
export async function projectTimeline(
  s: Scope,
  args: WindowArgs = {}
): Promise<{ weeks: Week[]; bars: TimelineBar[]; from: number; weekCount: number }> {
  const weekCount = clampWeeks(args.weeks);
  const from = Number.isFinite(args.from) ? (args.from as number) : Date.now();
  const weeks = weeksFrom(from, weekCount);

  const allocations = await listAllocationsInRange(s, {
    from: weeks[0].start,
    to: weeks[weeks.length - 1].end,
    statuses: COMMITTED_STATUSES
  });

  const byProject = new Map<string, TimelineBar>();
  for (const a of allocations) {
    const bar = byProject.get(a.projectId);
    if (!bar) {
      byProject.set(a.projectId, {
        projectId: a.projectId,
        projectName: a.projectName,
        status: 'active',
        startDate: a.startDate,
        endDate: a.endDate,
        minutesPerWeek: a.minutesPerWeek,
        people: [{ userId: a.assigneeUserId, name: a.assigneeName, minutesPerWeek: a.minutesPerWeek }]
      });
      continue;
    }
    bar.startDate = Math.min(bar.startDate, a.startDate);
    bar.endDate = Math.max(bar.endDate, a.endDate);
    bar.minutesPerWeek += a.minutesPerWeek;
    const person = bar.people.find((p) => p.userId === a.assigneeUserId);
    if (person) person.minutesPerWeek += a.minutesPerWeek;
    else
      bar.people.push({
        userId: a.assigneeUserId,
        name: a.assigneeName,
        minutesPerWeek: a.minutesPerWeek
      });
  }

  const bars = [...byProject.values()].sort(
    (a, b) => a.startDate - b.startDate || a.projectName.localeCompare(b.projectName)
  );
  return { weeks, bars, from: weeks[0].start, weekCount };
}

/**
 * How loaded a cell is, as a fraction of capacity.
 *
 * Zero capacity means nobody is available, so any allocation at all is
 * over-committed rather than a division by zero.
 */
export function loadRatio(allocated: number, capacity: number): number {
  if (capacity <= 0) return allocated > 0 ? Infinity : 0;
  return allocated / capacity;
}
