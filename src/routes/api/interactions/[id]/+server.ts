import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  deleteInteraction,
  isInteractionType,
  updateInteraction
} from '$lib/server/saveInteraction';
import { getInteraction } from '$lib/server/interactions-query';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const item = await getInteraction(s, params.id!);
  if (!item) throw error(404, 'not_found');
  return json(item);
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const patch: Parameters<typeof updateInteraction>[2] = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (body.type !== undefined) {
    if (!isInteractionType(body.type)) throw error(400, 'invalid_type');
    patch.type = body.type;
  }
  if (body.body === null || typeof body.body === 'string') patch.body = (body.body as string) ?? null;
  if (typeof body.occurredAt === 'number') patch.occurredAt = body.occurredAt;
  if (body.companyId === null || typeof body.companyId === 'string') {
    patch.companyId = (body.companyId as string) ?? null;
  }
  if (Array.isArray(body.personIds)) {
    patch.personIds = (body.personIds as unknown[]).filter((p): p is string => typeof p === 'string');
  }
  if (Array.isArray(body.projectIds)) {
    patch.projectIds = (body.projectIds as unknown[]).filter((p): p is string => typeof p === 'string');
  }
  try {
    await updateInteraction(s, params.id!, patch);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const fresh = await getInteraction(s, params.id!);
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  await deleteInteraction(s, params.id!);
  return new Response(null, { status: 204 });
};
