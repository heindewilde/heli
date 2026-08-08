import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import { createInvite, listPendingInvites, InviteError } from '$lib/server/invites';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { WORKSPACE_ROLES, type WorkspaceRole } from '$lib/server/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');
  const items = await listPendingInvites(s.region, s.workspaceId, url.origin);
  return json({ items });
};

export const POST: RequestHandler = async ({ url, request, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');
  // Invite spam is workspace-level abuse and email costs money, so this one
  // limit is keyed by workspace rather than by user.
  try {
    checkRateLimit(LIMITS.invite, s.workspaceId);
  } catch (err) {
    if (err instanceof RateLimitError) throw error(429, 'rate_limited');
    throw err;
  }
  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const role = (WORKSPACE_ROLES as readonly string[]).includes(String(body.role))
    ? (body.role as WorkspaceRole)
    : 'member';
  if (role === 'owner') throw error(400, 'invalid_role');
  try {
    const result = await createInvite(s.region, s.workspaceId, s.userId, url.origin, {
      email: String(body.email ?? ''),
      role
    });
    return json(result, { status: 201 });
  } catch (err) {
    if (err instanceof InviteError) throw error(400, err.code);
    throw err;
  }
};
