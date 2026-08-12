import type { RequestHandler } from './$types';
import { requireApiScope, requireRole } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { listMemberCapacities, setMemberCapacity } from '$lib/server/allocations';

export const GET: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'read');
  return apiOk(await listMemberCapacities(s));
};

/**
 * Set someone's working week, in minutes.
 *
 * Your own is yours to set; a colleague's is `requireRole`, matching the
 * private endpoint. Capacity drives every availability number in the app, so
 * quietly changing a teammate's is a workspace-wide edit wearing a personal
 * setting's clothes.
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const userId = typeof body.userId === 'string' && body.userId ? body.userId : s.userId;
  if (userId !== s.userId) requireRole(s, 'owner', 'admin');

  if (body.weeklyCapacityMinutes !== null && typeof body.weeklyCapacityMinutes !== 'number') {
    return apiError(
      'invalid_request',
      '`weeklyCapacityMinutes` must be a number of minutes, or null to use the default.',
      400
    );
  }

  try {
    await setMemberCapacity(s, userId, body.weeklyCapacityMinutes as number | null);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such member.', 404);
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await listMemberCapacities(s));
};
