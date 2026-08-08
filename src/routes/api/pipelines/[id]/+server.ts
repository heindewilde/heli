import { requireScope, requireRole } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  getPipeline,
  updatePipeline,
  deletePipeline,
  type UpdatePipelineInput
} from '$lib/server/pipelines';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const item = await getPipeline(s, params.id!);
  if (!item) throw error(404, 'not_found');
  return json(item);
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: UpdatePipelineInput;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    await updatePipeline(s, params.id!, body);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const fresh = await getPipeline(s, params.id!);
  if (!fresh) throw error(404, 'not_found');
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  // Takes the pipeline's stages and items with it. Admin-only.
  requireRole(s, 'owner', 'admin');
  await deletePipeline(s, params.id!);
  return new Response(null, { status: 204 });
};
