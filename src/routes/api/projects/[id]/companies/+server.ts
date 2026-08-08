import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { attachCompany, detachCompany } from '$lib/server/saveProject';

async function readBody(request: Request): Promise<{ companyId?: unknown }> {
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
  if (typeof body.companyId !== 'string') throw error(400, 'missing_companyId');
  try {
    await attachCompany(s, params.id!, body.companyId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.companyId !== 'string') throw error(400, 'missing_companyId');
  try {
    await detachCompany(s, params.id!, body.companyId);
  } catch (err) {
    throw error((err as Error).message === 'not_found' ? 404 : 400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
