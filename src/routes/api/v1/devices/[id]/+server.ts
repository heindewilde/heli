import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiError, apiOk, denyBearer } from '$lib/server/api-v1';
import { revokeDevice } from '$lib/server/devices';

/** Unpair a device. Cookie-session only — see the note in `../+server.ts`. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  const ok = await revokeDevice(s.region, s.userId, params.id);
  if (!ok) return apiError('not_found', 'No such device.', 404);
  return apiOk({ id: params.id, revoked: true });
};
