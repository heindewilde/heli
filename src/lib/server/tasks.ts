import { and, eq, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { tasks, people, companies, type Task, type MemberKind } from './schema';
import { sanitizePlainText } from './sanitize';

const MAX_TITLE_LEN = 500;

async function ensureRefExists(
  d: ReturnType<typeof db>,
  userId: string,
  kind: MemberKind,
  refId: string
): Promise<boolean> {
  if (kind === 'person') {
    const r = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, refId), eq(people.userId, userId)))
      .get();
    return !!r;
  }
  const r = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, refId), eq(companies.userId, userId)))
    .get();
  return !!r;
}

export async function listTasksForEntity(
  userId: string,
  region: string,
  kind: MemberKind,
  refId: string
): Promise<Task[]> {
  const d = db(region);
  const rows = await d.all<Task>(sql`
    SELECT
      id, user_id AS userId, kind, ref_id AS refId, title,
      due_at AS dueAt, completed_at AS completedAt,
      created_at AS createdAt, updated_at AS updatedAt
    FROM tasks
    WHERE user_id = ${userId} AND kind = ${kind} AND ref_id = ${refId}
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

export async function createTask(
  userId: string,
  region: string,
  input: CreateTaskInput
): Promise<Task> {
  const d = db(region);
  const title = sanitizePlainText(input.title, MAX_TITLE_LEN);
  if (!title) throw new Error('missing_title');
  if (!(await ensureRefExists(d, userId, input.kind, input.refId))) {
    throw new Error('not_found');
  }
  const id = createId();
  const now = Date.now();
  const dueAt = input.dueAt != null && Number.isFinite(input.dueAt) ? input.dueAt : null;
  await d.insert(tasks).values({
    id,
    userId,
    kind: input.kind,
    refId: input.refId,
    title,
    dueAt,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  });
  return {
    id,
    userId,
    kind: input.kind,
    refId: input.refId,
    title,
    dueAt,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export type UpdateTaskInput = {
  title?: string;
  dueAt?: number | null;
  completedAt?: number | null;
};

export async function updateTask(
  userId: string,
  region: string,
  id: string,
  input: UpdateTaskInput
): Promise<Task | null> {
  const d = db(region);
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
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  const row = await d
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get();
  return row ?? null;
}

export async function deleteTask(
  userId: string,
  region: string,
  id: string
): Promise<boolean> {
  const d = db(region);
  const row = await d
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get();
  if (!row) return false;
  await d.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  return true;
}
