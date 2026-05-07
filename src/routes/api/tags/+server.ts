import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  attachTag,
  detachTag,
  ensureTag,
  isTagScope,
  listTagsWithCounts
} from '$lib/server/tags';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const scope = url.searchParams.get('scope');
  if (!isTagScope(scope)) throw error(400, 'invalid_scope');
  const items = await listTagsWithCounts(locals.user.id, locals.user.region, scope);
  return json({ items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: { scope?: string; name?: string; entityId?: string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isTagScope(body.scope)) throw error(400, 'invalid_scope');
  const name = (body.name ?? '').trim();
  if (!name) throw error(400, 'missing_name');

  let tag;
  try {
    tag = await ensureTag(locals.user.id, locals.user.region, body.scope, name);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  if (body.entityId) {
    try {
      await attachTag(locals.user.id, locals.user.region, body.scope, body.entityId, tag.id);
    } catch (err) {
      throw error(400, (err as Error).message);
    }
  }
  return json(tag, { status: 201 });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  // Detach a tag from an entity. Tag itself is preserved (delete via /api/tags/[id]).
  if (!locals.user) throw error(401, 'unauthorized');
  let body: { scope?: string; entityId?: string; tagId?: string };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isTagScope(body.scope)) throw error(400, 'invalid_scope');
  if (!body.entityId || !body.tagId) throw error(400, 'missing_ids');
  try {
    await detachTag(locals.user.id, locals.user.region, body.scope, body.entityId, body.tagId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
