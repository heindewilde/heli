import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { getInteraction } from '$lib/server/interactions-query';
import {
  deleteInteraction,
  isInteractionType,
  updateInteraction
} from '$lib/server/saveInteraction';

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const item = await getInteraction(s, params.id);
  if (!item) return apiError('not_found', 'No such interaction.', 404);
  return apiOk(item);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const patch: Parameters<typeof updateInteraction>[2] = {};
  if (typeof body.title === 'string') patch.title = body.title;
  if (body.type !== undefined) {
    if (!isInteractionType(body.type)) {
      return apiError('invalid_request', 'A valid `type` is required.', 400);
    }
    patch.type = body.type;
  }
  // `body` is sanitized inside updateInteraction — it is rendered with {@html}.
  if (body.body === null || typeof body.body === 'string') {
    patch.body = (body.body as string) ?? null;
  }
  if (typeof body.occurredAt === 'number') patch.occurredAt = body.occurredAt;
  if (body.companyId === null || typeof body.companyId === 'string') {
    patch.companyId = (body.companyId as string) ?? null;
  }
  const stringIds = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
  const personIds = stringIds(body.personIds);
  if (personIds) patch.personIds = personIds;
  const projectIds = stringIds(body.projectIds);
  if (projectIds) patch.projectIds = projectIds;

  if (Object.keys(patch).length === 0) {
    return apiError('invalid_request', 'No writable fields supplied.', 400);
  }

  const existing = await getInteraction(s, params.id);
  if (!existing) return apiError('not_found', 'No such interaction.', 404);

  try {
    await updateInteraction(s, params.id, patch);
  } catch (err) {
    return apiError('invalid_request', (err as Error).message, 400);
  }
  return apiOk(await getInteraction(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  // The private route answers 204 whether or not the row existed. v1 documents
  // `{ id, deleted: true }` and a 404 for a miss, matching people and companies
  // — an offline client replaying a delete needs to tell "already gone" from
  // "never existed" without guessing from a bodyless response.
  const existing = await getInteraction(s, params.id);
  if (!existing) return apiError('not_found', 'No such interaction.', 404);
  await deleteInteraction(s, params.id);
  return apiOk({ id: params.id, deleted: true });
};
