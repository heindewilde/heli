import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createGoal, deleteGoal, listGoals, updateGoal } from '$lib/server/project-plan';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
}

function fail(err: unknown): never {
  const code = (err as Error).message;
  throw error(code === 'not_found' ? 404 : 400, code);
}

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  try {
    return json({ items: await listGoals(s, params.id!) });
  } catch (err) {
    fail(err);
  }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  try {
    return json(await createGoal(s, params.id!, body), { status: 201 });
  } catch (err) {
    fail(err);
  }
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await updateGoal(s, params.id!, body.id, body);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await deleteGoal(s, params.id!, body.id);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};
