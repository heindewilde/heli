import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { getPipeline, moveItemToStage } from '$lib/server/pipelines';

/**
 * Move a card to another stage.
 *
 * On the web this is a drag; on a phone it is an explicit stage picker or a
 * swipe, which is why the board falls back to a vertical list below `md`
 * already. Either way it is the same call.
 *
 * Naturally idempotent: `moveItemToStage` returns early when the item is
 * already in the target stage, so a replayed move neither errors nor writes a
 * second `pipeline_item_events` row.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  if (typeof body.toStageId !== 'string' || !body.toStageId) {
    return apiError('invalid_request', '`toStageId` is required.', 400);
  }

  try {
    await moveItemToStage(s, params.id, params.itemId, body.toStageId);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') {
      return apiError('not_found', 'No such pipeline, item or stage.', 404);
    }
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getPipeline(s, params.id));
};
