import { requireScope, requireRole } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteTag } from '$lib/server/tags';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  // Deletes the tag workspace-wide; the join rows cascade off every entity
  // carrying it. Detaching a tag from one record is POST/DELETE on /api/tags
  // and stays open to members.
  requireRole(s, 'owner', 'admin');
  await deleteTag(s, params.id!);
  return new Response(null, { status: 204 });
};
