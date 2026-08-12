/**
 * Milestones and goals — a project's plan, as opposed to its chores.
 *
 * Neither table carries `workspace_id`; both hang off `projects` the way
 * `pipeline_stages` hangs off `pipelines`. So **every export here calls
 * `projectExists(s, projectId)` before touching a row**, and every UPDATE and
 * DELETE additionally scopes on `project_id`. Skipping either would let an id
 * from another workspace through.
 *
 * Errors are thrown as bare strings and mapped to HTTP codes at the route,
 * matching pipelines.ts and outreach.ts.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db, type DB } from './db';
import { projectMilestones, projectGoals } from './schema';
import type { ProjectMilestone, ProjectGoal } from './schema';
import { sanitize, sanitizePlainText } from './sanitize';
import { projectExists } from './saveProject';
import type { Scope } from './scope';

const TITLE_MAX = 200;
const UNIT_MAX = 24;

/**
 * One queued statement. Drizzle types `batch` as a non-empty tuple, which a
 * list built in a loop can never satisfy, so the array is assembled loosely and
 * asserted at the call — same shape as `BatchWrite` in calendar.ts.
 */
type BatchWrite = Parameters<DB['batch']>[0][number];

export type MilestoneInput = {
  title?: string;
  description?: string | null;
  dueAt?: number | null;
  completedAt?: number | null;
};

export type GoalInput = {
  title?: string;
  unit?: string | null;
  targetValue?: number;
  currentValue?: number;
  dueAt?: number | null;
};

function coerceTitle(v: unknown): string {
  const t = sanitizePlainText(String(v ?? ''), TITLE_MAX);
  if (!t) throw new Error('missing_title');
  return t;
}

function coerceTimestamp(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error('invalid_date');
  return n;
}

/**
 * Counts are whole and non-negative. Rejecting rather than clamping: a goal of
 * "-3 posts" is a typo, and silently storing 0 hides it.
 */
function coerceCount(v: unknown, err: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error(err);
  return n;
}

/** Append position, shared by both tables. */
async function nextPosition(
  s: Scope,
  table: typeof projectMilestones | typeof projectGoals,
  projectId: string
): Promise<number> {
  const row = await db(s.region)
    .select({ max: sql<number | null>`MAX(${table.position})` })
    .from(table)
    .where(eq(table.projectId, projectId))
    .get();
  return (row?.max ?? -1) + 1;
}

// ----- Milestones ----------------------------------------------------------

export async function listMilestones(s: Scope, projectId: string): Promise<ProjectMilestone[]> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  return db(s.region)
    .select()
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, projectId))
    .orderBy(asc(projectMilestones.position), asc(projectMilestones.createdAt));
}

export async function createMilestone(
  s: Scope,
  projectId: string,
  input: MilestoneInput
): Promise<{ id: string }> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const id = createId();
  const now = Date.now();
  await db(s.region).insert(projectMilestones).values({
    id,
    projectId,
    title: coerceTitle(input.title),
    description: input.description == null ? null : sanitize(String(input.description)),
    dueAt: coerceTimestamp(input.dueAt),
    completedAt: coerceTimestamp(input.completedAt),
    position: await nextPosition(s, projectMilestones, projectId),
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export async function updateMilestone(
  s: Scope,
  projectId: string,
  id: string,
  input: MilestoneInput
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const updates: Partial<typeof projectMilestones.$inferInsert> = {};
  if (input.title !== undefined) updates.title = coerceTitle(input.title);
  if (input.description !== undefined) {
    updates.description = input.description == null ? null : sanitize(String(input.description));
  }
  if (input.dueAt !== undefined) updates.dueAt = coerceTimestamp(input.dueAt);
  if (input.completedAt !== undefined) updates.completedAt = coerceTimestamp(input.completedAt);
  if (Object.keys(updates).length === 0) throw new Error('no_updates');
  await db(s.region)
    .update(projectMilestones)
    .set({ ...updates, updatedAt: Date.now() })
    .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, projectId)));
}

export async function deleteMilestone(s: Scope, projectId: string, id: string): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(projectMilestones)
    .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, projectId)));
}

/**
 * Reorder by writing an explicit index per id.
 *
 * Ids not belonging to this project simply match nothing — the `project_id`
 * predicate on each UPDATE is what makes passing a foreign id a no-op rather
 * than a cross-tenant write, so no separate validation pass is needed.
 *
 * One batch, not a loop of awaits: against remote libSQL a per-row round trip
 * is the whole cost of the operation.
 */
export async function reorderMilestones(
  s: Scope,
  projectId: string,
  ids: string[]
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  if (ids.length === 0) return;
  const d = db(s.region);
  const now = Date.now();
  const writes = ids.map((id, i) =>
    d
      .update(projectMilestones)
      .set({ position: i, updatedAt: now })
      .where(and(eq(projectMilestones.id, id), eq(projectMilestones.projectId, projectId)))
  ) as BatchWrite[];
  await d.batch(writes as [BatchWrite, ...BatchWrite[]]);
}

// ----- Goals ---------------------------------------------------------------

export async function listGoals(s: Scope, projectId: string): Promise<ProjectGoal[]> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  return db(s.region)
    .select()
    .from(projectGoals)
    .where(eq(projectGoals.projectId, projectId))
    .orderBy(asc(projectGoals.position), asc(projectGoals.createdAt));
}

export async function createGoal(
  s: Scope,
  projectId: string,
  input: GoalInput
): Promise<{ id: string }> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const target = coerceCount(input.targetValue, 'invalid_target');
  if (target === 0) throw new Error('invalid_target');
  const id = createId();
  const now = Date.now();
  await db(s.region).insert(projectGoals).values({
    id,
    projectId,
    title: coerceTitle(input.title),
    unit: input.unit == null ? null : sanitizePlainText(String(input.unit), UNIT_MAX) || null,
    targetValue: target,
    currentValue: input.currentValue === undefined ? 0 : coerceCount(input.currentValue, 'invalid_current'),
    dueAt: coerceTimestamp(input.dueAt),
    position: await nextPosition(s, projectGoals, projectId),
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export async function updateGoal(
  s: Scope,
  projectId: string,
  id: string,
  input: GoalInput
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const updates: Partial<typeof projectGoals.$inferInsert> = {};
  if (input.title !== undefined) updates.title = coerceTitle(input.title);
  if (input.unit !== undefined) {
    updates.unit = input.unit == null ? null : sanitizePlainText(String(input.unit), UNIT_MAX) || null;
  }
  if (input.targetValue !== undefined) {
    const t = coerceCount(input.targetValue, 'invalid_target');
    if (t === 0) throw new Error('invalid_target');
    updates.targetValue = t;
  }
  if (input.currentValue !== undefined) {
    updates.currentValue = coerceCount(input.currentValue, 'invalid_current');
  }
  if (input.dueAt !== undefined) updates.dueAt = coerceTimestamp(input.dueAt);
  if (Object.keys(updates).length === 0) throw new Error('no_updates');
  await db(s.region)
    .update(projectGoals)
    .set({ ...updates, updatedAt: Date.now() })
    .where(and(eq(projectGoals.id, id), eq(projectGoals.projectId, projectId)));
}

export async function deleteGoal(s: Scope, projectId: string, id: string): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(projectGoals)
    .where(and(eq(projectGoals.id, id), eq(projectGoals.projectId, projectId)));
}
