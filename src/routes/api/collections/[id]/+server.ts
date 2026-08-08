import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  getCollection,
  updateCollection,
  deleteCollection,
  type UpdateCollectionInput
} from '$lib/server/collections';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const item = await getCollection(s, params.id!);
  if (!item) throw error(404, 'not_found');
  return json(item);
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: UpdateCollectionInput;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    await updateCollection(s, params.id!, body);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const fresh = await getCollection(s, params.id!);
  if (!fresh) throw error(404, 'not_found');
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  await deleteCollection(s, params.id!);
  return new Response(null, { status: 204 });
};
