import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import { ensureWorkspace, removeMember, setMemberRole } from '$lib/server/workspaces';
import { switchWorkspace } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
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
  // 'owner' is in WORKSPACE_ROLES but is not assignable here: it would create a
  // second owner-role row while workspaces.owner_user_id still names someone
  // else. Handing over the workspace goes through POST /api/workspace/transfer,
  // which moves both together.
  if (body.role === 'owner') throw error(400, 'invalid_role');
  try {
    await setMemberRole(s.region, s.workspaceId, params.userId!, body.role as WorkspaceRole);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
  const s = requireScope(locals);
  // Anyone may remove themselves (leave); removing someone else needs admin.
  const leaving = params.userId === s.userId;
  if (!leaving) requireRole(s, 'owner', 'admin');
  try {
    await removeMember(s.region, s.workspaceId, params.userId!);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  if (!leaving) return new Response(null, { status: 204 });

  // Leaving changes which workspace this session sees. validateSession would
  // eventually repair it via ensureWorkspace, but that repair keeps the *same*
  // cookie — and the service worker partitions its cached /api/* responses by
  // `Vary: Cookie`, so the user's other tabs would keep serving the workspace
  // they just left. Rotate here for the same reason switchWorkspace exists.
  const next = await ensureWorkspace(
    s.region,
    s.userId,
    `${locals.user?.username ?? 'My'}'s workspace`
  );
  if (locals.sessionId) {
    const rotated = await switchWorkspace(locals.sessionId, s.userId, s.region, next.workspaceId);
    setSessionCookie(cookies, rotated.sessionId);
  }
  return json({ workspaceId: next.workspaceId, workspaceName: next.workspaceName });
};
