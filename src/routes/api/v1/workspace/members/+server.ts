import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { listMemberCapacities } from '$lib/server/allocations';

/**
 * Who is in this workspace, and what their working week is.
 *
 * `listMemberCapacities` already returns identity, role *and* capacity in one
 * query — capacity lives on the membership row rather than on the user, so the
 * join is the same one either question needs. Calling `listMembers` alongside
 * it and merging would be a second round trip for columns already in hand.
 *
 * Read-only. Inviting, removing and role changes stay on the web: they are
 * account-shaped decisions with an email side effect, and a phone is not where
 * anyone should be reorganising a team. The mobile Settings screen links out.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'read');
  return apiOk(await listMemberCapacities(s));
};
