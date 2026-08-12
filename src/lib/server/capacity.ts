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
import { minutesInWeek, weeksFrom, type Week } from '$lib/weeks';
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
