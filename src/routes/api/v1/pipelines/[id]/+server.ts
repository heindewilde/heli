import type { RequestHandler } from './$types';
import { requireApiScope, requireRole } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { deletePipeline, getPipeline, updatePipeline } from '$lib/server/pipelines';

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const found = await getPipeline(s, params.id);
  if (!found) return apiError('not_found', 'No such pipeline.', 404);
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
    await updatePipeline(s, params.id, body as never);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such pipeline.', 404);
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getPipeline(s, params.id));
};

/**
 * Deleting a pipeline is `requireRole`, matching the web.
 *
 * Editing a board is routine work; discarding one takes a shared view away
 * from everybody, which is the line `requireRole` draws throughout the app.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  requireRole(s, 'owner', 'admin');
  const existing = await getPipeline(s, params.id);
  if (!existing) return apiError('not_found', 'No such pipeline.', 404);
  await deletePipeline(s, params.id);
  return apiOk({ id: params.id, deleted: true });
};
