/**
 * Who is booked on which project, for which weeks, at how many hours.
 *
 * This module is in `ALLOW_FILES` in `scripts/check-tenancy.ts`, and the reason
 * is `assignee_user_id`. Rule A fails any `user_id` filter, because in this
 * codebase `user_id` is created-by attribution and filtering on it is a
 * cross-tenant bug waiting to happen. Here the *assignee* column is a genuine
 * owner — "show me my weeks" is a real query — so the filter is correct and the
 * exemption is one file wide. Every query still filters `workspace_id` first.
 *
 * Hours are integer minutes throughout. Money stays cents.
 */
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  projectAllocations,
  projects,
  users,
  workspaceMembers,
  DEFAULT_WEEKLY_CAPACITY_MINUTES
} from './schema';
import { sanitizePlainText } from './sanitize';
import { projectExists } from './saveProject';
import type { Scope } from './scope';

const NOTE_MAX = 200;
/** 24×7. A week cannot hold more, and a typo like "24000" should not silently pass. */
const MAX_MINUTES_PER_WEEK = 7 * 24 * 60;

export type AllocationInput = {
  assigneeUserId?: string;
  startDate?: number;
  endDate?: number;
  minutesPerWeek?: number;
  dayMask?: number | null;
  hourlyRate?: number | null;
  note?: string | null;
};

/** An allocation with the bits the UI needs to render it without a second query. */
export type AllocationRow = {
  id: string;
  projectId: string;
  projectName: string;
  assigneeUserId: string;
  assigneeName: string;
  startDate: number;
  endDate: number;
  minutesPerWeek: number;
  dayMask: number | null;
  hourlyRate: number | null;
  note: string | null;
};

export type MemberCapacity = {
  userId: string;
  name: string;
  email: string;
  role: string;
  capacityMinutes: number;
  /** False when the member has never set one and is running on the default. */
  capacityIsExplicit: boolean;
};

function coerceMinutes(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) throw new Error('invalid_minutes');
  if (n > MAX_MINUTES_PER_WEEK) throw new Error('invalid_minutes');
  return n;
}

function coerceDate(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error('invalid_date');
  return n;
}

/**
 * A weekday bitmask, 0–127. Zero and null both mean "unspecified" and are
 * stored as null, so there is one representation of "no pattern" rather than
 * two that every reader would have to check for.
 */
function coerceDayMask(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 0b1111111) throw new Error('invalid_days');
  return n === 0 ? null : n;
}

function coerceRate(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_money');
  return Math.round(n);
}

/**
 * The assignee must be a member of *this* workspace.
 *
 * Without this an allocation could name any user id in the region, which both
 * leaks a name onto the availability grid and books a stranger.
 */
async function assertMember(s: Scope, userId: string): Promise<void> {
  const row = await db(s.region)
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, userId))
    )
    .get();
  if (!row) throw new Error('not_a_member');
}

/** Members of the workspace with their weekly capacity, for the grid and the picker. */
export async function listMemberCapacities(s: Scope): Promise<MemberCapacity[]> {
  const rows = await db(s.region)
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      capacity: workspaceMembers.weeklyCapacityMinutes,
      name: users.username,
      email: users.email
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, s.workspaceId))
    .orderBy(asc(users.username));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name || r.email,
    email: r.email,
    role: r.role,
    capacityMinutes: r.capacity ?? DEFAULT_WEEKLY_CAPACITY_MINUTES,
    capacityIsExplicit: r.capacity != null
  }));
}

/**
 * Set a member's weekly capacity. `null` clears it back to the default.
 *
 * The *authorisation* rule (you may set your own; owners and admins may set
 * anyone's) lives at the route, because it depends on the caller rather than
 * the data.
 */
export async function setMemberCapacity(
  s: Scope,
  userId: string,
  minutes: number | null
): Promise<void> {
  await assertMember(s, userId);
  const value = minutes == null ? null : coerceMinutes(minutes);
  await db(s.region)
    .update(workspaceMembers)
    .set({ weeklyCapacityMinutes: value })
    .where(
      and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, userId))
    );
}

const ROW_COLS = {
  id: projectAllocations.id,
  projectId: projectAllocations.projectId,
  projectName: projects.name,
  assigneeUserId: projectAllocations.assigneeUserId,
  assigneeName: sql<string>`COALESCE(NULLIF(TRIM(${users.username}), ''), ${users.email})`.as(
    'assigneeName'
  ),
  startDate: projectAllocations.startDate,
  endDate: projectAllocations.endDate,
  minutesPerWeek: projectAllocations.minutesPerWeek,
  dayMask: projectAllocations.dayMask,
  hourlyRate: projectAllocations.hourlyRate,
  note: projectAllocations.note
};

export function listAllocationsForProject(s: Scope, projectId: string): Promise<AllocationRow[]> {
  return db(s.region)
    .select(ROW_COLS)
    .from(projectAllocations)
    .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
    .innerJoin(users, eq(users.id, projectAllocations.assigneeUserId))
    .where(
      and(
        eq(projectAllocations.workspaceId, s.workspaceId),
        eq(projectAllocations.projectId, projectId)
      )
    )
    .orderBy(asc(projectAllocations.startDate));
}

/**
 * Every allocation overlapping [from, to).
 *
 * One query for the whole availability window — the grid then buckets in JS.
 * A per-member or per-week query would be the thing that makes that page slow
 * against remote libSQL, where each call is a network round trip.
 *
 * Overlap, not containment: an allocation running Jan–Dec must appear in a
 * March window even though neither of its endpoints falls inside it.
 */
export function listAllocationsInRange(
  s: Scope,
  args: { from: number; to: number; assigneeIds?: string[]; statuses?: string[] }
): Promise<AllocationRow[]> {
  const conditions = [
    eq(projectAllocations.workspaceId, s.workspaceId),
    lte(projectAllocations.startDate, args.to),
    gte(projectAllocations.endDate, args.from)
  ];
  if (args.assigneeIds?.length) {
    conditions.push(inArray(projectAllocations.assigneeUserId, args.assigneeIds));
  }
  if (args.statuses?.length) conditions.push(inArray(projects.status, args.statuses));

  return db(s.region)
    .select(ROW_COLS)
    .from(projectAllocations)
    .innerJoin(projects, eq(projects.id, projectAllocations.projectId))
    .innerJoin(users, eq(users.id, projectAllocations.assigneeUserId))
    .where(and(...conditions))
    .orderBy(asc(projectAllocations.startDate));
}

export async function createAllocation(
  s: Scope,
  projectId: string,
  input: AllocationInput
): Promise<{ id: string }> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  if (!input.assigneeUserId) throw new Error('missing_assignee');
  await assertMember(s, input.assigneeUserId);

  const startDate = coerceDate(input.startDate);
  const endDate = coerceDate(input.endDate);
  if (endDate < startDate) throw new Error('invalid_range');

  const id = createId();
  const now = Date.now();
  await db(s.region).insert(projectAllocations).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    assigneeUserId: input.assigneeUserId,
    projectId,
    startDate,
    endDate,
    minutesPerWeek: coerceMinutes(input.minutesPerWeek),
    dayMask: coerceDayMask(input.dayMask),
    hourlyRate: coerceRate(input.hourlyRate),
    note: input.note == null ? null : sanitizePlainText(String(input.note), NOTE_MAX) || null,
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export async function updateAllocation(
  s: Scope,
  id: string,
  input: AllocationInput
): Promise<void> {
  const updates: Partial<typeof projectAllocations.$inferInsert> = {};
  if (input.assigneeUserId !== undefined) {
    await assertMember(s, input.assigneeUserId);
    updates.assigneeUserId = input.assigneeUserId;
  }
  if (input.startDate !== undefined) updates.startDate = coerceDate(input.startDate);
  if (input.endDate !== undefined) updates.endDate = coerceDate(input.endDate);
  if (input.minutesPerWeek !== undefined) updates.minutesPerWeek = coerceMinutes(input.minutesPerWeek);
  if (input.dayMask !== undefined) updates.dayMask = coerceDayMask(input.dayMask);
  if (input.hourlyRate !== undefined) updates.hourlyRate = coerceRate(input.hourlyRate);
  if (input.note !== undefined) {
    updates.note = input.note == null ? null : sanitizePlainText(String(input.note), NOTE_MAX) || null;
  }
  if (Object.keys(updates).length === 0) throw new Error('no_updates');

  // A one-sided date edit still has to end up with end >= start, so the check
  // reads the stored row rather than only the payload.
  if (updates.startDate !== undefined || updates.endDate !== undefined) {
    const existing = await db(s.region)
      .select({ startDate: projectAllocations.startDate, endDate: projectAllocations.endDate })
      .from(projectAllocations)
      .where(
        and(eq(projectAllocations.id, id), eq(projectAllocations.workspaceId, s.workspaceId))
      )
      .get();
    if (!existing) throw new Error('not_found');
    const start = updates.startDate ?? existing.startDate;
    const end = updates.endDate ?? existing.endDate;
    if (end < start) throw new Error('invalid_range');
  }

  await db(s.region)
    .update(projectAllocations)
    .set({ ...updates, updatedAt: Date.now() })
    .where(and(eq(projectAllocations.id, id), eq(projectAllocations.workspaceId, s.workspaceId)));
}

export async function deleteAllocation(s: Scope, id: string): Promise<void> {
  await db(s.region)
    .delete(projectAllocations)
    .where(and(eq(projectAllocations.id, id), eq(projectAllocations.workspaceId, s.workspaceId)));
}
