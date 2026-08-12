import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { revokeDevice, setPushToken } from '$lib/server/devices';

/**
 * The two things a phone may do to its own registration, and nothing else.
 *
 * This is the one deliberate exception to "a bearer credential cannot manage
 * credentials". Registering a push token has to happen from the device that
 * owns it — the token comes from APNs/FCM at runtime and the web has no way to
 * know it. And signing out has to work from the phone in your hand.
 *
 * Both act on `locals.token.id` only. There is no id parameter, so there is
 * nothing to tamper with: a device cannot name another device here even by
 * accident, which is why revoking a lost phone stays a web-only act.
 */
function requireDevice(locals: App.Locals): Response | null {
  if (locals.token?.kind === 'device') return null;
  return apiError('forbidden', 'This endpoint is for paired devices.', 403);
}

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const denied = requireDevice(locals);
  if (denied) return denied;
  const s = requireScope(locals);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (!('pushToken' in body)) {
    return apiError('invalid_request', 'Nothing to update.', 400);
  }
  // Explicit null turns notifications off, which is what the app sends when the
  // user revokes the permission at the OS level.
  const pushToken = typeof body.pushToken === 'string' ? body.pushToken : null;
  await setPushToken(s.region, locals.token!.id, pushToken);
  return apiOk({ pushEnabled: pushToken !== null });
};

export const DELETE: RequestHandler = async ({ locals }) => {
  const denied = requireDevice(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  await revokeDevice(s.region, s.userId, locals.token!.id);
  return apiOk({ revoked: true });
};
