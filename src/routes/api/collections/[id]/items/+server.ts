import { error, type RequestHandler } from '@sveltejs/kit';
import { addToCollection, removeFromCollection } from '$lib/server/collections';
import { isMemberKind } from '$lib/server/pipelines';

type Body = { kind?: unknown; refId?: unknown };

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  try {
    await addToCollection(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.kind,
      body.refId
    );
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  try {
    await removeFromCollection(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.kind,
      body.refId
    );
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
