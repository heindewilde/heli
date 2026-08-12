import type { RequestHandler } from './$types';
import { requireApiScope, requireRole } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { deleteTag } from '$lib/server/tags';

/**
 * Delete a tag outright, everywhere.
 *
 * `requireRole`, matching the private endpoint: this is not "remove this tag
 * from this person" — that is `DELETE /api/v1/tags` with an entity — it removes
 * the tag from every record that carried it.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  requireRole(s, 'owner', 'admin');
  await deleteTag(s, params.id);
  return apiOk({ id: params.id, deleted: true });
};
