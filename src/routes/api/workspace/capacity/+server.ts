import { requireRole, requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { listMemberCapacities, setMemberCapacity } from '$lib/server/allocations';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  return json({ members: await listMemberCapacities(s) });
};

/**
 * Set a member's weekly capacity, in minutes. `null` clears it back to the
 * default.
 *
 * The role rule is per-target rather than per-endpoint, which is why there is
 * no unconditional `requireRole` here: your own working week is yours to state,
 * and changing a colleague's is workspace configuration. `requireRole` throws
 * 403 before anything is written.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }

  const userId = typeof body.userId === 'string' ? body.userId : s.userId;
  if (userId !== s.userId) requireRole(s, 'owner', 'admin');

  const raw = body.weeklyCapacityMinutes;
  if (raw !== null && typeof raw !== 'number') throw error(400, 'invalid_minutes');

  try {
    await setMemberCapacity(s, userId, raw);
  } catch (err) {
    const code = (err as Error).message;
    throw error(code === 'not_a_member' ? 404 : 400, code);
  }
  return new Response(null, { status: 204 });
};
