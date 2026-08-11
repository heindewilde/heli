import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createReminder, isReminderKind, listReminders } from '$lib/server/reminders-query';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const items = await listReminders(s);
  return json({ items });
};

const ERRORS: Record<string, number> = {
  ref_not_found: 404,
  invalid_remind_at: 400
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
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

  try {
    const created = await createReminder(s, { kind: body.kind, refId: body.refId, remindAt });
    return json(created, { status: 201 });
  } catch (err) {
    const code = (err as Error).message;
    throw error(ERRORS[code] ?? 400, code);
  }
};
