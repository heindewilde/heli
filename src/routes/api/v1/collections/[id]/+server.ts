import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { deleteCollection, getCollection, updateCollection } from '$lib/server/collections';

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const found = await getCollection(s, params.id);
  if (!found) return apiError('not_found', 'No such collection.', 404);
  return apiOk(found);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  try {
    await updateCollection(s, params.id, body as never);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such collection.', 404);
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getCollection(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const existing = await getCollection(s, params.id);
  if (!existing) return apiError('not_found', 'No such collection.', 404);
  await deleteCollection(s, params.id);
  return apiOk({ id: params.id, deleted: true });
};
