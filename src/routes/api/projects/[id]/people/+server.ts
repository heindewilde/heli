import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { attachPerson, detachPerson } from '$lib/server/saveProject';

async function readBody(request: Request): Promise<{ personId?: unknown }> {
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
  if (typeof body.personId !== 'string') throw error(400, 'missing_personId');
  try {
    await attachPerson(s, params.id!, body.personId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.personId !== 'string') throw error(400, 'missing_personId');
  try {
    await detachPerson(s, params.id!, body.personId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
