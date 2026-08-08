import { type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { listMembers } from '$lib/server/workspaces';
import { jsonWithEtag } from '$lib/server/cache';

export const GET: RequestHandler = async ({ request, locals }) => {
  const s = requireScope(locals);
  const items = await listMembers(s.region, s.workspaceId);
  return jsonWithEtag(request, { items });
};
