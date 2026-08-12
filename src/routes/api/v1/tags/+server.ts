import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import {
  attachTag,
  detachTag,
  ensureTag,
  getTagsForEntity,
  isTagScope,
  listTagsWithCounts
} from '$lib/server/tags';

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read', 'tags');
  const scope = url.searchParams.get('scope') ?? 'person';
  if (!isTagScope(scope)) return apiError('invalid_request', 'scope must be person or company.', 400);
  return apiOk(await listTagsWithCounts(s, scope));
};

/**
 * Attach a tag to one record, creating it if this is the first use.
 *
 * Create-and-attach in one call because that is how tagging is actually done —
 * you type a word onto a person and it either exists or it starts existing.
 * Splitting it would make the common path two round trips, and would leave an
 * orphan tag behind whenever the second one failed.
 *
 * Idempotent: `ensureTag` resolves by slug and `attachTag` uses
 * `onConflictDoNothing` on the composite key, so a replayed attach is a no-op.
 * That is why this needs no `Idempotency-Key`.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const scope = body.scope ?? 'person';
  if (!isTagScope(scope)) {
    return apiError('invalid_request', '`scope` must be `person` or `company`.', 400);
  }
  if (typeof body.entityId !== 'string' || !body.entityId) {
    return apiError('invalid_request', '`entityId` is required.', 400);
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return apiError('invalid_request', '`name` is required.', 400);
  }

  try {
    const tag = await ensureTag(s, scope, body.name);
    await attachTag(s, scope, body.entityId, tag.id);
    // The record's full tag list, so a client can replace rather than merge.
    return apiOk(await getTagsForEntity(s, scope, body.entityId), { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such record.', 404);
    return apiError('invalid_request', msg, 400);
  }
};

/** Detach a tag from one record. The tag itself survives — see `tags/[id]`. */
export const DELETE: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'write');
  const scope = url.searchParams.get('scope') ?? 'person';
  const entityId = url.searchParams.get('entityId');
  const tagId = url.searchParams.get('tagId');
  if (!isTagScope(scope) || !entityId || !tagId) {
    return apiError('invalid_request', '`scope`, `entityId` and `tagId` are required.', 400);
  }
  await detachTag(s, scope, entityId, tagId);
  return apiOk(await getTagsForEntity(s, scope, entityId));
};
