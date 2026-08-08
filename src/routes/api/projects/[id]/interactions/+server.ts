import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { attachInteraction, detachInteraction } from '$lib/server/saveProject';

async function readBody(request: Request): Promise<{ interactionId?: unknown }> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.interactionId !== 'string') throw error(400, 'missing_interactionId');
  try {
    await attachInteraction(s, params.id!, body.interactionId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.interactionId !== 'string') throw error(400, 'missing_interactionId');
  try {
    await detachInteraction(s, params.id!, body.interactionId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
