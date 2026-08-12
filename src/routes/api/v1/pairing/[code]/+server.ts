import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiOk, denyBearer } from '$lib/server/api-v1';
import { cancelPairing, pairingStatus } from '$lib/server/devices';

/**
 * Poll a pairing code, and cancel one.
 *
 * Both cookie-session only, and both scoped to the code's own user inside
 * `devices.ts` — polling someone else's code would leak that they are setting
 * up a phone, and cancelling one would be a denial of service.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  return apiOk(await pairingStatus(s, params.code));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  await cancelPairing(s, params.code);
  return apiOk({ cancelled: true });
};
