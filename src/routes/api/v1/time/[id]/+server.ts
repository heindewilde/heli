import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { deleteEntry, updateEntry } from '$lib/server/time';

/**
 * Edit or delete one entry.
 *
 * Ownership is enforced inside `time.ts`: your own entries are yours, and
 * touching a colleague's calls `requireRole` there. That is why this handler
 * has no role check of its own and why `time.ts` is in `ALLOW_FILES` — it
 * filters on a `user_id` that is a real owner rather than attribution.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  try {
    await updateEntry(s, params.id, body as never);
    return apiOk({ id: params.id, updated: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such time entry.', 404);
    if (msg === 'forbidden') {
      return apiError('forbidden', 'That entry belongs to someone else.', 403);
    }
    return apiError('invalid_request', msg, 400);
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  try {
    await deleteEntry(s, params.id);
    return apiOk({ id: params.id, deleted: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such time entry.', 404);
    if (msg === 'forbidden') {
      return apiError('forbidden', 'That entry belongs to someone else.', 403);
    }
    return apiError('invalid_request', msg, 400);
  }
};
