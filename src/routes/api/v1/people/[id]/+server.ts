import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { fetchPersonRow } from '$lib/server/people-rows';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { sanitizePlainText } from '$lib/server/sanitize';
import { bumpSearchEpoch } from '$lib/server/search';

const TEXT_FIELDS = ['name', 'role', 'email', 'phone', 'location', 'notes'] as const;

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const row = await fetchPersonRow(s, params.id);
  if (!row) return apiError('not_found', 'No such person.', 404);
  return apiOk(row);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const f of TEXT_FIELDS) {
    if (f in body) patch[f] = body[f] == null ? null : sanitizePlainText(String(body[f]), 4000);
  }
  if ('companyId' in body) patch.companyId = body.companyId ? String(body.companyId) : null;
  if ('isFavorite' in body) patch.isFavorite = body.isFavorite ? 1 : 0;
  if ('isArchived' in body) patch.isArchived = body.isArchived ? 1 : 0;
  if (Object.keys(patch).length === 1) {
    return apiError('invalid_request', 'No writable fields supplied.', 400);
  }

  const res = await db(s.region)
    .update(people)
    .set(patch)
    .where(and(eq(people.id, params.id), eq(people.workspaceId, s.workspaceId)));
  if (res.rowsAffected === 0) return apiError('not_found', 'No such person.', 404);

  bumpSearchEpoch(s.workspaceId);
  return apiOk(await fetchPersonRow(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const res = await db(s.region)
    .delete(people)
    .where(and(eq(people.id, params.id), eq(people.workspaceId, s.workspaceId)));
  if (res.rowsAffected === 0) return apiError('not_found', 'No such person.', 404);
  bumpSearchEpoch(s.workspaceId);
  return apiOk({ id: params.id, deleted: true });
};
