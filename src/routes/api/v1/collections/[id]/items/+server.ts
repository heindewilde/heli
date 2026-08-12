import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { addToCollection, getCollection, removeFromCollection } from '$lib/server/collections';
import { isMemberKind } from '$lib/server/pipelines';

/**
 * Add and remove members.
 *
 * Both are idempotent at the database level — `onConflictDoNothing` on the
 * composite key going in, a no-op delete coming out — so neither needs an
 * `Idempotency-Key` to survive a replayed outbox entry.
 */

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  if (!isMemberKind(body.kind) || typeof body.refId !== 'string' || !body.refId) {
    return apiError('invalid_request', '`kind` and `refId` are required.', 400);
  }

  try {
    await addToCollection(s, params.id, body.kind, body.refId);
  } catch (err) {
    if ((err as Error).message === 'not_found') {
      return apiError('not_found', 'No such collection or record.', 404);
    }
    return apiError('invalid_request', (err as Error).message, 400);
  }
  return apiOk(await getCollection(s, params.id), { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
  const s = requireApiScope(locals, 'write');
  const kind = url.searchParams.get('kind');
  const refId = url.searchParams.get('refId');
  if (!isMemberKind(kind) || !refId) {
    return apiError('invalid_request', '`kind` and `refId` are required.', 400);
  }
  try {
    await removeFromCollection(s, params.id, kind, refId);
  } catch (err) {
    if ((err as Error).message === 'not_found') {
      return apiError('not_found', 'No such collection.', 404);
    }
    return apiError('invalid_request', (err as Error).message, 400);
  }
  return apiOk(await getCollection(s, params.id));
};
