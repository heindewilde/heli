import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { deleteTask, updateTask } from '$lib/server/tasks';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const patch: Parameters<typeof updateTask>[2] = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (body.dueAt === null || typeof body.dueAt === 'number') {
    patch.dueAt = body.dueAt as number | null;
  }
  // `completed` is the field a client actually thinks in; the column is a
  // timestamp, so that a completed task remembers *when*.
  if (typeof body.completed === 'boolean') {
    patch.completedAt = body.completed ? Date.now() : null;
  } else if (body.completedAt === null || typeof body.completedAt === 'number') {
    patch.completedAt = body.completedAt as number | null;
  }

  if (Object.keys(patch).length === 0) {
    return apiError('invalid_request', 'No writable fields supplied.', 400);
  }

  const task = await updateTask(s, params.id, patch);
  if (!task) return apiError('not_found', 'No such task.', 404);
  return apiOk(task);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const ok = await deleteTask(s, params.id);
  if (!ok) return apiError('not_found', 'No such task.', 404);
  return apiOk({ id: params.id, deleted: true });
};
