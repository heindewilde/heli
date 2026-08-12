import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiOk, denyBearer } from '$lib/server/api-v1';
import { listDevices } from '$lib/server/devices';

/**
 * The user's paired devices, across every workspace they belong to.
 *
 * Cookie-session only. Listing and revoking other devices is account
 * management, and a device that could do it could lock its owner out of the
 * very thing they would use to revoke it.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  return apiOk(await listDevices(s.region, s.userId));
};
