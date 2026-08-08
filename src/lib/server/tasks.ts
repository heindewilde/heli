import { and, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { tasks, people, companies, type Task, type MemberKind } from './schema';
import { sanitizePlainText } from './sanitize';
import type { Scope } from './scope';

const MAX_TITLE_LEN = 500;

async function ensureRefExists(
  d: ReturnType<typeof db>,
  workspaceId: string,
  kind: MemberKind,
  refId: string
): Promise<boolean> {
  if (kind === 'person') {
    const r = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, refId), eq(people.workspaceId, workspaceId)))
      .get();
    return !!r;
  }
  const r = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, refId), eq(companies.workspaceId, workspaceId)))
    .get();
  return !!r;
}

// Tasks read as shared work, so they are scoped by workspace alone — every
// member sees the workspace's tasks. (Contrast reminders-query.ts, where the
// rows are personal and must also filter on user_id.) A per-task assignee is a
// later chunk; `user_id` already records who created it.
export async function listTasksForEntity(
  s: Scope,
  kind: MemberKind,
  refId: string
): Promise<Task[]> {
  const d = db(s.region);
  const rows = await d.all<Task>(sql`
    SELECT
      id, workspace_id AS workspaceId, user_id AS userId, kind, ref_id AS refId, title,
      due_at AS dueAt, completed_at AS completedAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM tasks
    WHERE workspace_id = ${s.workspaceId} AND kind = ${kind} AND ref_id = ${refId}
    ORDER BY
      CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
      CASE WHEN completed_at IS NULL THEN
        CASE WHEN due_at IS NULL THEN 1 ELSE 0 END
      ELSE 0 END,
      CASE WHEN completed_at IS NULL THEN due_at ELSE -completed_at END
    LIMIT 50
  `);
  return rows.map((r) => ({
    ...r,
    dueAt: r.dueAt == null ? null : Number(r.dueAt),
    completedAt: r.completedAt == null ? null : Number(r.completedAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt)
  }));
}

export type CreateTaskInput = {
  kind: MemberKind;
  refId: string;
  title: string;
  dueAt?: number | null;
};

export async function createTask(s: Scope, input: CreateTaskInput): Promise<Task> {
  const d = db(s.region);
  const title = sanitizePlainText(input.title, MAX_TITLE_LEN);
  if (!title) throw new Error('missing_title');
  if (!(await ensureRefExists(d, s.workspaceId, input.kind, input.refId))) {
    throw new Error('not_found');
  }
  const id = createId();
  const now = Date.now();
  const dueAt = input.dueAt != null && Number.isFinite(input.dueAt) ? input.dueAt : null;
  const row: Task = {
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    kind: input.kind,
    refId: input.refId,
    title,
    dueAt,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
  await d.insert(tasks).values(row);
  return row;
}

export type UpdateTaskInput = {
  title?: string;
  dueAt?: number | null;
  completedAt?: number | null;
};

export async function updateTask(
  s: Scope,
  id: string,
  input: UpdateTaskInput
): Promise<Task | null> {
  const d = db(s.region);
  const updates: Partial<typeof tasks.$inferInsert> = { updatedAt: Date.now() };
  if (input.title !== undefined) {
    const next = sanitizePlainText(input.title, MAX_TITLE_LEN);
    if (!next) throw new Error('missing_title');
    updates.title = next;
  }
  if (input.dueAt !== undefined) {
    updates.dueAt = input.dueAt != null && Number.isFinite(input.dueAt) ? input.dueAt : null;
  }
  if (input.completedAt !== undefined) {
    updates.completedAt =
      input.completedAt != null && Number.isFinite(input.completedAt) ? input.completedAt : null;
  }
  await d
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspaceId)));
  const row = await d
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspaceId)))
    .get();
  return row ?? null;
}

export async function deleteTask(s: Scope, id: string): Promise<boolean> {
  const d = db(s.region);
  const row = await d
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspaceId)))
    .get();
  if (!row) return false;
  await d.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspaceId)));
  return true;
}
