import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { addItemToPipeline, getPipeline, isMemberKind } from '$lib/server/pipelines';

/**
 * Put a person or company on the board.
 *
 * `addItemToPipeline` reports `alreadyExisted` rather than failing on the
 * `(pipeline_id, kind, ref_id)` unique index, so a replayed add is a no-op and
 * this needs no idempotency key.
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
    const result = await addItemToPipeline(s, params.id, {
      kind: body.kind,
      refId: body.refId,
      stageId: typeof body.stageId === 'string' ? body.stageId : null
    });
    return apiOk(result, { status: result.alreadyExisted ? 200 : 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such pipeline or record.', 404);
    return apiError('invalid_request', msg, 400);
  }
};

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const found = await getPipeline(s, params.id);
  if (!found) return apiError('not_found', 'No such pipeline.', 404);
  return apiOk(found.items ?? []);
};
