import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { switchWorkspace, AuthError } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const s = requireScope(locals);
  let body: { workspaceId?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.workspaceId !== 'string' || !body.workspaceId) {
    throw error(400, 'missing_workspace_id');
  }
  if (!locals.sessionId) throw error(401, 'unauthorized');

  try {
    const next = await switchWorkspace(locals.sessionId, s.userId, s.region, body.workspaceId);
    setSessionCookie(cookies, next.sessionId);
  } catch (err) {
    if (err instanceof AuthError) throw error(403, err.code);
    throw err;
  }
  // The client must purge the service worker's /api/* cache and hard-navigate:
  // those entries were stored under the previous workspace.
  return json({ ok: true });
};
