/**
 * Tracked time: the running timer, manual entries, and the billing rollup.
 *
 * In `ALLOW_FILES` in `scripts/check-tenancy.ts`. `time_entries.user_id` is a
 * real owner rather than created-by attribution — "my week" is the primary
 * query and only the owner (or an admin) may edit a row — so filtering on it is
 * correct here. Every statement still filters `workspace_id` first.
 *
 * Two invariants worth keeping in mind:
 *
 * - **`ended_at IS NULL` is the running timer.** No separate table, no flag.
 * - **The rate is snapshotted on the row**, not re-derived at report time.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  timeEntries,
  projectAllocations,
  projectCompanies,
  projectMilestones,
  projects,
  companies,
  users
} from './schema';
import { weekKey } from '$lib/weeks';
import { billingImpliesBillable, type BillingType } from '$lib/projectTypes';
import { sanitizePlainText } from './sanitize';
import { requireRole, type Scope } from './scope';

const DESCRIPTION_MAX = 500;
/** A single entry longer than this is a forgotten timer, not a day's work. */
const MAX_ENTRY_MS = 24 * 60 * 60 * 1000;

export type TimeEntryRow = {
  id: string;
  userId: string;
  userName: string;
  projectId: string | null;
  projectName: string | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
  description: string | null;
  startedAt: number;
  endedAt: number | null;
  billable: boolean;
  hourlyRate: number | null;
  currency: string | null;
};

export type TimeFilters = {
  /** Defaults to the caller. Pass `'all'` for the whole workspace. */
  userId?: string | 'all';
  projectId?: string;
  from?: number;
  to?: number;
  billable?: boolean;
  limit?: number;
};

const ROW_COLS = {
  id: timeEntries.id,
  userId: timeEntries.userId,
  userName: sql<string>`COALESCE(NULLIF(TRIM(${users.username}), ''), ${users.email})`.as(
    'userName'
  ),
  projectId: timeEntries.projectId,
  projectName: projects.name,
  milestoneId: timeEntries.milestoneId,
  milestoneTitle: projectMilestones.title,
  description: timeEntries.description,
  startedAt: timeEntries.startedAt,
  endedAt: timeEntries.endedAt,
  billable: timeEntries.billable,
  hourlyRate: timeEntries.hourlyRate,
  currency: timeEntries.currency
};

/** The joins are LEFT because project and milestone are both optional. */
function baseQuery(s: Scope) {
  return db(s.region)
    .select(ROW_COLS)
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .leftJoin(projects, eq(projects.id, timeEntries.projectId))
    .leftJoin(projectMilestones, eq(projectMilestones.id, timeEntries.milestoneId));
}

function shape(r: {
  billable: number;
  [k: string]: unknown;
}): TimeEntryRow {
  return { ...r, billable: r.billable === 1 } as TimeEntryRow;
}

function filterConditions(s: Scope, f: TimeFilters) {
  const conditions = [eq(timeEntries.workspaceId, s.workspaceId)];
  const who = f.userId ?? s.userId;
  if (who !== 'all') conditions.push(eq(timeEntries.userId, who));
  if (f.projectId) conditions.push(eq(timeEntries.projectId, f.projectId));
  if (f.from != null) conditions.push(gte(timeEntries.startedAt, f.from));
  if (f.to != null) conditions.push(lt(timeEntries.startedAt, f.to));
  if (f.billable != null) conditions.push(eq(timeEntries.billable, f.billable ? 1 : 0));
  return conditions;
}

export async function listTimeEntries(s: Scope, f: TimeFilters = {}): Promise<TimeEntryRow[]> {
  const rows = await baseQuery(s)
    .where(and(...filterConditions(s, f)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(Math.min(f.limit ?? 200, 500));
  return rows.map(shape);
}

/** The caller's running entry, if they have one. */
export async function getRunningEntry(s: Scope): Promise<TimeEntryRow | null> {
  const row = await baseQuery(s)
    .where(
      and(
        eq(timeEntries.workspaceId, s.workspaceId),
        eq(timeEntries.userId, s.userId),
        isNull(timeEntries.endedAt)
      )
    )
    .get();
  return row ? shape(row) : null;
}

/**
 * Resolve the rate to stamp on an entry: the assignee's allocation on that
 * project if it has an override, otherwise the project's own rate.
 *
 * Returns nulls for an unassigned entry or an unbilled project — a non-billable
 * hour has no rate to record, and inventing one would make it look invoiceable.
 */
async function resolveRate(
  s: Scope,
  projectId: string | null,
  userId: string,
  at: number
): Promise<{ billable: boolean; hourlyRate: number | null; currency: string | null }> {
  if (!projectId) return { billable: false, hourlyRate: null, currency: null };

  const project = await db(s.region)
    .select({
      billingType: projects.billingType,
      hourlyRate: projects.hourlyRate,
      currency: projects.currency
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .get();
  if (!project) throw new Error('not_found');

  const billable = billingImpliesBillable(project.billingType as BillingType);
  if (!billable) return { billable: false, hourlyRate: null, currency: project.currency };

  // An allocation covering this moment may override the project rate — a senior
  // bills more than a junior on the same engagement.
  const override = await db(s.region)
    .select({ hourlyRate: projectAllocations.hourlyRate })
    .from(projectAllocations)
    .where(
      and(
        eq(projectAllocations.workspaceId, s.workspaceId),
        eq(projectAllocations.projectId, projectId),
        eq(projectAllocations.assigneeUserId, userId),
        lte(projectAllocations.startDate, at),
        gte(projectAllocations.endDate, at)
      )
    )
    .get();

  return {
    billable: true,
    hourlyRate: override?.hourlyRate ?? project.hourlyRate,
    currency: project.currency
  };
}

function coerceDescription(v: unknown): string | null {
  if (v == null) return null;
  return sanitizePlainText(String(v), DESCRIPTION_MAX) || null;
}

/**
 * Check a project id belongs to this workspace, and a milestone to that
 * project. Returns the pair to write.
 */
async function resolveTarget(
  s: Scope,
  projectId: unknown,
  milestoneId: unknown
): Promise<{ projectId: string | null; milestoneId: string | null }> {
  const pid = typeof projectId === 'string' && projectId ? projectId : null;
  const mid = typeof milestoneId === 'string' && milestoneId ? milestoneId : null;
  if (!pid) return { projectId: null, milestoneId: null };

  const project = await db(s.region)
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, pid), eq(projects.workspaceId, s.workspaceId)))
    .get();
  if (!project) throw new Error('not_found');

  if (!mid) return { projectId: pid, milestoneId: null };
  const milestone = await db(s.region)
    .select({ id: projectMilestones.id })
    .from(projectMilestones)
    .where(and(eq(projectMilestones.id, mid), eq(projectMilestones.projectId, pid)))
    .get();
  if (!milestone) throw new Error('milestone_not_in_project');
  return { projectId: pid, milestoneId: mid };
}

export type StartInput = {
  projectId?: string | null;
  milestoneId?: string | null;
  description?: string | null;
  billable?: boolean;
};

/**
 * Start the clock.
 *
 * Relies on `uq_time_entries_running` rather than reading first: a read-then-
 * write races with the same user's other tab, and the index is the only thing
 * that can actually decide. A violation means one is already running, which we
 * return instead of failing — the caller's intent ("I want a timer going") is
 * already satisfied.
 */
export async function startTimer(
  s: Scope,
  input: StartInput = {}
): Promise<{ entry: TimeEntryRow; alreadyRunning: boolean }> {
  const now = Date.now();
  const { projectId, milestoneId } = await resolveTarget(s, input.projectId, input.milestoneId);
  const rate = await resolveRate(s, projectId, s.userId, now);

  try {
    const id = createId();
    await db(s.region).insert(timeEntries).values({
      id,
      workspaceId: s.workspaceId,
      userId: s.userId,
      projectId,
      milestoneId,
      description: coerceDescription(input.description),
      startedAt: now,
      endedAt: null,
      billable: (input.billable ?? rate.billable) ? 1 : 0,
      hourlyRate: rate.hourlyRate,
      currency: rate.currency,
      createdAt: now,
      updatedAt: now
    });
  } catch (err) {
    const running = await getRunningEntry(s);
    if (running) return { entry: running, alreadyRunning: true };
    throw err;
  }

  const entry = await getRunningEntry(s);
  if (!entry) throw new Error('not_found');
  return { entry, alreadyRunning: false };
}

/**
 * Stop the clock, re-stamping the rate as of the stop.
 *
 * A timer left running overnight is capped rather than recorded: an entry of
 * 61 hours is always a mistake, and silently billing it is worse than clamping
 * it to a day and letting someone correct it.
 */
export async function stopTimer(s: Scope): Promise<TimeEntryRow | null> {
  const running = await getRunningEntry(s);
  if (!running) return null;

  const now = Date.now();
  const endedAt = Math.min(now, running.startedAt + MAX_ENTRY_MS);
  const rate = await resolveRate(s, running.projectId, s.userId, running.startedAt);

  await db(s.region)
    .update(timeEntries)
    .set({
      endedAt,
      // Only overwrite the snapshot when the entry is billable; a manual
      // "not billable" tick set while running must survive the stop.
      hourlyRate: running.billable ? rate.hourlyRate : null,
      currency: running.billable ? rate.currency : null,
      updatedAt: now
    })
    .where(
      and(
        eq(timeEntries.id, running.id),
        eq(timeEntries.workspaceId, s.workspaceId),
        eq(timeEntries.userId, s.userId)
      )
    );

  const rows = await baseQuery(s)
    .where(and(eq(timeEntries.workspaceId, s.workspaceId), eq(timeEntries.id, running.id)))
    .get();
  return rows ? shape(rows) : null;
}

export type ManualInput = StartInput & {
  startedAt?: number;
  /** Either an explicit end, or a duration in minutes from the start. */
  endedAt?: number;
  minutes?: number;
};

export async function createEntry(s: Scope, input: ManualInput): Promise<{ id: string }> {
  const startedAt = Number(input.startedAt);
  if (!Number.isFinite(startedAt)) throw new Error('invalid_date');

  let endedAt: number;
  if (input.minutes != null) {
    const m = Number(input.minutes);
    if (!Number.isFinite(m) || m <= 0) throw new Error('invalid_minutes');
    endedAt = startedAt + Math.round(m) * 60_000;
  } else if (input.endedAt != null) {
    endedAt = Number(input.endedAt);
    if (!Number.isFinite(endedAt)) throw new Error('invalid_date');
  } else {
    throw new Error('missing_duration');
  }
  if (endedAt <= startedAt) throw new Error('invalid_range');
  if (endedAt - startedAt > MAX_ENTRY_MS) throw new Error('too_long');

  const { projectId, milestoneId } = await resolveTarget(s, input.projectId, input.milestoneId);
  const rate = await resolveRate(s, projectId, s.userId, startedAt);
  const billable = input.billable ?? rate.billable;

  const id = createId();
  const now = Date.now();
  await db(s.region).insert(timeEntries).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    projectId,
    milestoneId,
    description: coerceDescription(input.description),
    startedAt,
    endedAt,
    billable: billable ? 1 : 0,
    hourlyRate: billable ? rate.hourlyRate : null,
    currency: billable ? rate.currency : null,
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export type UpdateInput = ManualInput;

/**
 * Edit an entry.
 *
 * **An entry belongs to the person who tracked it.** A member may only edit
 * their own; owners and admins may correct anyone's, because somebody has to be
 * able to fix a timesheet before it is invoiced. That is a predicate on the
 * write, not a route-level role gate — the same endpoint serves both.
 */
export async function updateEntry(s: Scope, id: string, input: UpdateInput): Promise<void> {
  const existing = await db(s.region)
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      billable: timeEntries.billable
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.workspaceId, s.workspaceId)))
    .get();
  if (!existing) throw new Error('not_found');
  if (existing.userId !== s.userId) requireRole(s, 'owner', 'admin');

  const updates: Partial<typeof timeEntries.$inferInsert> = {};
  if (input.description !== undefined) updates.description = coerceDescription(input.description);
  if (input.startedAt !== undefined) {
    const v = Number(input.startedAt);
    if (!Number.isFinite(v)) throw new Error('invalid_date');
    updates.startedAt = v;
  }
  if (input.minutes != null) {
    const m = Number(input.minutes);
    if (!Number.isFinite(m) || m <= 0) throw new Error('invalid_minutes');
    updates.endedAt = (updates.startedAt ?? existing.startedAt) + Math.round(m) * 60_000;
  } else if (input.endedAt !== undefined) {
    const v = Number(input.endedAt);
    if (!Number.isFinite(v)) throw new Error('invalid_date');
    updates.endedAt = v;
  }

  const start = updates.startedAt ?? existing.startedAt;
  const end = updates.endedAt ?? existing.endedAt;
  // A running entry has no end yet, so there is nothing to validate against.
  if (end != null) {
    if (end <= start) throw new Error('invalid_range');
    if (end - start > MAX_ENTRY_MS) throw new Error('too_long');
  }

  // Re-filing an entry re-resolves its rate: the project decides what an hour
  // on it is worth, so moving an hour must move its price with it.
  const refiled = input.projectId !== undefined || input.milestoneId !== undefined;
  if (refiled) {
    const target = await resolveTarget(s, input.projectId, input.milestoneId);
    updates.projectId = target.projectId;
    updates.milestoneId = target.milestoneId;
  }

  if (refiled || input.billable !== undefined) {
    const projectId = refiled ? (updates.projectId ?? null) : undefined;
    const rate = await resolveRate(
      s,
      projectId === undefined ? null : projectId,
      existing.userId,
      start
    );
    const billable = input.billable ?? (refiled ? rate.billable : existing.billable === 1);
    updates.billable = billable ? 1 : 0;
    if (refiled) {
      updates.hourlyRate = billable ? rate.hourlyRate : null;
      updates.currency = billable ? rate.currency : null;
    } else if (!billable) {
      updates.hourlyRate = null;
      updates.currency = null;
    }
  }

  if (Object.keys(updates).length === 0) throw new Error('no_updates');
  await db(s.region)
    .update(timeEntries)
    .set({ ...updates, updatedAt: Date.now() })
    .where(and(eq(timeEntries.id, id), eq(timeEntries.workspaceId, s.workspaceId)));
}

export async function deleteEntry(s: Scope, id: string): Promise<void> {
  const existing = await db(s.region)
    .select({ userId: timeEntries.userId })
    .from(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.workspaceId, s.workspaceId)))
    .get();
  if (!existing) throw new Error('not_found');
  if (existing.userId !== s.userId) requireRole(s, 'owner', 'admin');

  await db(s.region)
    .delete(timeEntries)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.workspaceId, s.workspaceId)));
}

/** What a report's rows are. Different questions, same entries. */
export const GROUP_BYS = ['project', 'person', 'client', 'day', 'week'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export function isGroupBy(v: unknown): v is GroupBy {
  return typeof v === 'string' && (GROUP_BYS as readonly string[]).includes(v);
}

/**
 * Billing increments, in minutes. 0 is "don't round".
 *
 * Rounding is applied **per entry**, which is the agency convention and also
 * the only version that is defensible on an invoice: three six-minute calls are
 * three billable units, not eighteen minutes rounded once.
 */
export const ROUNDING_CHOICES = [0, 6, 15, 30, 60] as const;

export type SummaryGroup = {
  key: string;
  label: string;
  /** Set when the row is a project or a client, so the UI can link to it. */
  href: string | null;
  minutes: number;
  billableMinutes: number;
  /** Cents. Only from entries that actually carry a rate. */
  amount: number;
  currency: string | null;
  entries: number;
};

export type TimeSummary = {
  groupBy: GroupBy;
  roundTo: number;
  groups: SummaryGroup[];
  totalMinutes: number;
  billableMinutes: number;
  /** Unrounded, so the rounding's effect is visible rather than hidden. */
  rawMinutes: number;
  /** Cents per currency — a workspace can bill in more than one. */
  amountByCurrency: Record<string, number>;
};

/**
 * Totals by project for a filtered range.
 *
 * Running entries are excluded: an hour that has not finished is not yet a
 * number you can invoice, and including a live one would make every refresh of
 * a report show a different total.
 *
 * The arithmetic is done in JS off one query rather than as SQL aggregates.
 * The row cap keeps that bounded, and it means the rounding rule for money is
 * the same one the row list uses.
 */
export type SummaryOptions = { groupBy?: GroupBy; roundTo?: number };

/** Round up to the next increment. 12 minutes at a 15-minute increment is 15. */
function roundUp(minutes: number, increment: number): number {
  if (!increment || increment <= 0) return minutes;
  return Math.ceil(minutes / increment) * increment;
}

export async function timeSummary(
  s: Scope,
  f: TimeFilters = {},
  opts: SummaryOptions = {}
): Promise<TimeSummary> {
  const groupBy: GroupBy = opts.groupBy ?? 'project';
  const roundTo = ROUNDING_CHOICES.includes(
    (opts.roundTo ?? 0) as (typeof ROUNDING_CHOICES)[number]
  )
    ? (opts.roundTo ?? 0)
    : 0;

  const conditions = filterConditions(s, f);
  const rows = await db(s.region)
    .select({
      projectId: timeEntries.projectId,
      projectName: projects.name,
      userId: timeEntries.userId,
      userName: sql<string>`COALESCE(NULLIF(TRIM(${users.username}), ''), ${users.email})`.as(
        'userName'
      ),
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      billable: timeEntries.billable,
      hourlyRate: timeEntries.hourlyRate,
      currency: timeEntries.currency
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .leftJoin(projects, eq(projects.id, timeEntries.projectId))
    .where(and(...conditions, sql`${timeEntries.endedAt} IS NOT NULL`))
    .orderBy(asc(timeEntries.startedAt));

  // Grouping by client needs the company behind each project. One query for
  // the projects actually present, not one per row.
  let clientByProject = new Map<string, { id: string; name: string }>();
  if (groupBy === 'client') {
    const ids = [...new Set(rows.map((r) => r.projectId).filter((v): v is string => !!v))];
    if (ids.length > 0) {
      const links = await db(s.region)
        .select({
          projectId: projectCompanies.projectId,
          companyId: companies.id,
          companyName: companies.name
        })
        .from(projectCompanies)
        .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
        .where(and(eq(companies.workspaceId, s.workspaceId), inArray(projectCompanies.projectId, ids)));
      // A project can carry several companies; the first is the client for
      // reporting purposes, and a project with two clients is a data problem
      // rather than something to model here.
      for (const l of links) {
        if (!clientByProject.has(l.projectId)) {
          clientByProject.set(l.projectId, { id: l.companyId, name: l.companyName });
        }
      }
    }
  }

  const buckets = new Map<string, SummaryGroup>();
  const amountByCurrency: Record<string, number> = {};
  let totalMinutes = 0;
  let rawMinutes = 0;
  let billableMinutes = 0;

  for (const r of rows) {
    const raw = Math.round(((r.endedAt as number) - r.startedAt) / 60_000);
    const minutes = roundUp(raw, roundTo);

    let key: string;
    let label: string;
    let href: string | null = null;
    if (groupBy === 'person') {
      key = r.userId;
      label = r.userName;
    } else if (groupBy === 'client') {
      const client = r.projectId ? clientByProject.get(r.projectId) : undefined;
      key = client?.id ?? '';
      label = client?.name ?? 'No client';
      href = client ? `/companies/${client.id}` : null;
    } else if (groupBy === 'day') {
      const d = new Date(r.startedAt);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      label = key;
    } else if (groupBy === 'week') {
      key = weekKey(r.startedAt);
      label = key;
    } else {
      key = r.projectId ?? '';
      label = r.projectName ?? 'No project';
      href = r.projectId ? `/projects/${r.projectId}` : null;
    }

    const group =
      buckets.get(key) ??
      ({
        key,
        label,
        href,
        minutes: 0,
        billableMinutes: 0,
        amount: 0,
        currency: r.currency,
        entries: 0
      } satisfies SummaryGroup);

    group.minutes += minutes;
    group.entries += 1;
    totalMinutes += minutes;
    rawMinutes += raw;

    if (r.billable === 1) {
      group.billableMinutes += minutes;
      billableMinutes += minutes;
      if (r.hourlyRate != null) {
        const cents = Math.round((r.hourlyRate * minutes) / 60);
        group.amount += cents;
        const cur = r.currency ?? '—';
        amountByCurrency[cur] = (amountByCurrency[cur] ?? 0) + cents;
      }
    }
    buckets.set(key, group);
  }

  // Chronological groupings read in time order; the rest read biggest-first.
  const groups = [...buckets.values()].sort(
    groupBy === 'day' || groupBy === 'week'
      ? (a, b) => a.key.localeCompare(b.key)
      : (a, b) => b.minutes - a.minutes
  );

  return { groupBy, roundTo, groups, totalMinutes, billableMinutes, rawMinutes, amountByCurrency };
}

/**
 * Tracked minutes per project for a set of project ids — what the project page
 * compares against its committed hours.
 */
export async function trackedByProject(
  s: Scope,
  projectIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;
  const rows = await db(s.region)
    .select({
      projectId: timeEntries.projectId,
      minutes: sql<number>`SUM((${timeEntries.endedAt} - ${timeEntries.startedAt}) / 60000)`
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, s.workspaceId),
        inArray(timeEntries.projectId, projectIds),
        sql`${timeEntries.endedAt} IS NOT NULL`
      )
    )
    .groupBy(timeEntries.projectId);
  for (const r of rows) {
    if (r.projectId) out.set(r.projectId, Math.round(Number(r.minutes ?? 0)));
  }
  return out;
}
