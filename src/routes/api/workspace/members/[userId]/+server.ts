import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import { removeMember, setMemberRole } from '$lib/server/workspaces';
import { WORKSPACE_ROLES, type WorkspaceRole } from '$lib/server/schema';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');
  let body: { role?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!(WORKSPACE_ROLES as readonly string[]).includes(String(body.role))) {
    throw error(400, 'invalid_role');
  }
  try {
    await setMemberRole(s.region, s.workspaceId, params.userId!, body.role as WorkspaceRole);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireScope(locals);
  // Anyone may remove themselves (leave); removing someone else needs admin.
  if (params.userId !== s.userId) requireRole(s, 'owner', 'admin');
  try {
    await removeMember(s.region, s.workspaceId, params.userId!);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return new Response(null, { status: 204 });
};
