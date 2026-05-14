import { error, type RequestHandler } from '@sveltejs/kit';
import { addToCollection, removeFromCollection } from '$lib/server/collections';
import { addItemToPipeline, removePipelineItemByRef, isMemberKind } from '$lib/server/pipelines';
import { getCollectionSync } from '$lib/server/sync';

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
  const { id: userId, region } = locals.user;
  const collectionId = params.id!;
  try {
    await addToCollection(userId, region, collectionId, body.kind, body.refId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const sync = await getCollectionSync(userId, region, collectionId);
  if (sync) {
    try {
      await addItemToPipeline(userId, region, sync.pipelineId, { kind: body.kind, refId: body.refId });
    } catch { /* item may already be in the pipeline */ }
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
  const { id: userId, region } = locals.user;
  const collectionId = params.id!;
  try {
    await removeFromCollection(userId, region, collectionId, body.kind, body.refId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const sync = await getCollectionSync(userId, region, collectionId);
  if (sync) {
    try {
      await removePipelineItemByRef(userId, region, sync.pipelineId, body.kind, body.refId);
    } catch { /* item may not be in the pipeline */ }
  }
  return new Response(null, { status: 204 });
};
