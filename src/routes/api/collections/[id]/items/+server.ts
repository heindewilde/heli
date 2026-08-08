import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { addToCollection, removeFromCollection } from '$lib/server/collections';
import { addItemToPipeline, removePipelineItemByRef, isMemberKind } from '$lib/server/pipelines';
import { getCollectionSync } from '$lib/server/sync';

type Body = { kind?: unknown; refId?: unknown };

export const POST: RequestHandler = async ({ request, params, locals }) => {
  const s = requireScope(locals);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  const collectionId = params.id!;
  try {
    await addToCollection(s, collectionId, body.kind, body.refId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const sync = await getCollectionSync(s, collectionId);
  if (sync) {
    try {
      await addItemToPipeline(s, sync.pipelineId, { kind: body.kind, refId: body.refId });
    } catch { /* item may already be in the pipeline */ }
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  const s = requireScope(locals);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  const collectionId = params.id!;
  try {
    await removeFromCollection(s, collectionId, body.kind, body.refId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const sync = await getCollectionSync(s, collectionId);
  if (sync) {
    try {
      await removePipelineItemByRef(s, sync.pipelineId, body.kind, body.refId);
    } catch { /* item may not be in the pipeline */ }
  }
  return new Response(null, { status: 204 });
};
