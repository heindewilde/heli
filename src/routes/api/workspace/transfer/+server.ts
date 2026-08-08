import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import { transferOwnership } from '$lib/server/workspaces';

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner');
  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.userId !== 'string' || !body.userId) throw error(400, 'missing_user_id');
  try {
    await transferOwnership(s.region, s.workspaceId, s.userId, body.userId);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  return json({ ok: true });
};
