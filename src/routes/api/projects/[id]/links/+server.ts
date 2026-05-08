import { error, json, type RequestHandler } from '@sveltejs/kit';
import { addLink, removeLink, updateLink } from '$lib/server/saveProject';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const body = await readBody(request);
  try {
    const result = await addLink(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.url,
      body.label
    );
    return json(result, { status: 201 });
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await updateLink(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.id,
      body.url,
      body.label
    );
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await removeLink(locals.user.id, locals.user.region, params.id!, body.id);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
