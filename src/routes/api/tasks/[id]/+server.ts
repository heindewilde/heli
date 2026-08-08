import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { deleteTask, updateTask } from '$lib/server/tasks';

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: { title?: unknown; dueAt?: unknown; completedAt?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }

  const patch: { title?: string; dueAt?: number | null; completedAt?: number | null } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string') throw error(400, 'invalid_title');
    patch.title = body.title;
  }

  if (body.dueAt !== undefined) {
    if (body.dueAt === null) {
      patch.dueAt = null;
    } else if (typeof body.dueAt === 'number') {
      if (!Number.isFinite(body.dueAt)) throw error(400, 'invalid_due_at');
      patch.dueAt = body.dueAt;
    } else if (typeof body.dueAt === 'string') {
      const t = new Date(body.dueAt).getTime();
      if (!Number.isFinite(t)) throw error(400, 'invalid_due_at');
      patch.dueAt = t;
    } else {
      throw error(400, 'invalid_due_at');
    }
  }

  if (body.completedAt !== undefined) {
    if (body.completedAt === null) {
      patch.completedAt = null;
    } else if (typeof body.completedAt === 'number') {
      if (!Number.isFinite(body.completedAt)) throw error(400, 'invalid_completed_at');
      patch.completedAt = body.completedAt;
    } else {
      throw error(400, 'invalid_completed_at');
    }
  }

  try {
    const updated = await updateTask(s, params.id!, patch);
    if (!updated) throw error(404, 'not_found');
    return json(updated);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'missing_title') throw error(400, 'missing_title');
    throw err;
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const ok = await deleteTask(s, params.id!);
  if (!ok) throw error(404, 'not_found');
  return new Response(null, { status: 204 });
};
