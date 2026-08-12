import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  createAllocation,
  deleteAllocation,
  listAllocationsForProject,
  listMemberCapacities,
  updateAllocation
} from '$lib/server/allocations';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
}

function fail(err: unknown): never {
  const code = (err as Error).message;
  throw error(code === 'not_found' ? 404 : code === 'not_a_member' ? 409 : 400, code);
}

/**
 * The project's allocations, plus the workspace's members and their capacities
 * — the picker needs both and they always render together.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const [items, members] = await Promise.all([
    listAllocationsForProject(s, params.id!),
    listMemberCapacities(s)
  ]);
  return json({ items, members });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  try {
    return json(await createAllocation(s, params.id!, body), { status: 201 });
  } catch (err) {
    fail(err);
  }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await updateAllocation(s, body.id, body);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  if (typeof body.id !== 'string') throw error(400, 'missing_id');
  try {
    await deleteAllocation(s, body.id);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};
