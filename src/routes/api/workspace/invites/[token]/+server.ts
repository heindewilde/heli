import { type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import { revokeInvite } from '$lib/server/invites';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');
  await revokeInvite(s.region, s.workspaceId, params.token!);
  return new Response(null, { status: 204 });
};
