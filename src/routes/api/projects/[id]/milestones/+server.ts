import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  reorderMilestones,
  updateMilestone
} from '$lib/server/project-plan';

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
    return json({ items: await listMilestones(s, params.id!) });
  } catch (err) {
    fail(err);
  }
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  try {
    return json(await createMilestone(s, params.id!, body), { status: 201 });
  } catch (err) {
    fail(err);
  }
};

/**
 * Doubles as reorder: an array `order` of milestone ids means "these are the
 * positions now". Same shape as PATCH /api/pipelines/[id]/stages, which reads
 * `body.order` for the same reason — a reorder is not a field edit and giving
 * it its own verb folder for one array would be heavier than the branch.
 */
export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const body = await readBody(request);
  try {
    if (Array.isArray(body.order)) {
      if (!body.order.every((v): v is string => typeof v === 'string')) {
        throw new Error('invalid_order');
      }
      await reorderMilestones(s, params.id!, body.order);
    } else {
      if (typeof body.id !== 'string') throw new Error('missing_id');
      await updateMilestone(s, params.id!, body.id, body);
    }
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
    await deleteMilestone(s, params.id!, body.id);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};
