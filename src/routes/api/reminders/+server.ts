import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '$lib/server/db';
import { reminders, people, companies, interactions, projects, REMINDER_KINDS, type ReminderKind } from '$lib/server/schema';
import { listReminders } from '$lib/server/reminders-query';

function isReminderKind(v: unknown): v is ReminderKind {
  return typeof v === 'string' && (REMINDER_KINDS as readonly string[]).includes(v);
}

async function refExists(userId: string, region: string, kind: ReminderKind, refId: string): Promise<boolean> {
  const d = db(region);
  if (kind === 'person') {
    const r = await d.select({ id: people.id }).from(people).where(and(eq(people.id, refId), eq(people.userId, userId))).get();
    return !!r;
  }
  if (kind === 'company') {
    const r = await d.select({ id: companies.id }).from(companies).where(and(eq(companies.id, refId), eq(companies.userId, userId))).get();
    return !!r;
  }
  if (kind === 'interaction') {
    const r = await d.select({ id: interactions.id }).from(interactions).where(and(eq(interactions.id, refId), eq(interactions.userId, userId))).get();
    return !!r;
  }
  const r = await d.select({ id: projects.id }).from(projects).where(and(eq(projects.id, refId), eq(projects.userId, userId))).get();
  return !!r;
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const items = await listReminders(locals.user.id, locals.user.region);
  return json({ items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: { kind?: string; refId?: string; remindAt?: number | string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isReminderKind(body.kind)) throw error(400, 'invalid_kind');
  if (!body.refId || typeof body.refId !== 'string') throw error(400, 'missing_ref');

  let remindAt: number;
  if (typeof body.remindAt === 'number') {
    remindAt = body.remindAt;
  } else if (typeof body.remindAt === 'string') {
    remindAt = new Date(body.remindAt).getTime();
  } else {
    throw error(400, 'invalid_remind_at');
  }
  if (!Number.isFinite(remindAt)) throw error(400, 'invalid_remind_at');

  if (!(await refExists(locals.user.id, locals.user.region, body.kind, body.refId))) {
    throw error(404, 'ref_not_found');
  }

  const d = db(locals.user.region);
  const id = createId();
  await d.insert(reminders).values({
    id,
    userId: locals.user.id,
    kind: body.kind,
    refId: body.refId,
    remindAt,
    createdAt: Date.now()
  });
  return json({ id, kind: body.kind, refId: body.refId, remindAt }, { status: 201 });
};
