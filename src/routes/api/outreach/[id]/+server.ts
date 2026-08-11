import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { deleteTemplate, getTemplate, updateTemplate } from '$lib/server/outreach';

const ERRORS: Record<string, number> = { not_found: 404 };

function fail(err: unknown): never {
  const code = (err as Error).message;
  throw error(ERRORS[code] ?? 400, code);
}

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    await updateTemplate(s, params.id!, body as never);
  } catch (err) {
    fail(err);
  }
  const fresh = await getTemplate(s, params.id!);
  if (!fresh) throw error(404, 'not_found');
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  try {
    await deleteTemplate(s, params.id!);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};
