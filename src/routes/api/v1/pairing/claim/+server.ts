import type { RequestHandler } from './$types';
import { apiError, apiOk } from '$lib/server/api-v1';
import { claimPairing, normalizeCode } from '$lib/server/devices';
import { listMemberships } from '$lib/server/workspaces';
import { checkRateLimit, LIMITS, RateLimitError, safeClientAddress } from '$lib/server/rate-limit';

/**
 * Exchange a pairing code for a device token.
 *
 * Deliberately unauthenticated: the phone has no credential yet, so the code
 * *is* the proof. That makes the rate limit the only thing between a guessed
 * code and a live credential, so it is checked before anything else and keyed by
 * IP. Ten attempts per quarter-hour against 50 bits of entropy inside a
 * 120-second window is not a guessing game worth playing.
 *
 * Every failure — malformed, unknown, expired, already claimed — returns the
 * same 404 with the same message. Distinguishing them would turn this into an
 * oracle for which codes exist.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    checkRateLimit(LIMITS.deviceClaim, safeClientAddress(getClientAddress));
  } catch (err) {
    if (err instanceof RateLimitError) {
      const res = apiError('rate_limited', 'Too many attempts. Try again later.', 429);
      res.headers.set('Retry-After', '900');
      return res;
    }
    throw err;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const code = typeof body.code === 'string' ? normalizeCode(body.code) : null;
  if (!code) return apiError('not_found', 'That code is not valid.', 404);

  const result = await claimPairing(code, {
    name: String(body.deviceName ?? 'Mobile device'),
    platform: String(body.platform ?? 'ios'),
    appVersion: typeof body.appVersion === 'string' ? body.appVersion : null
  });
  if (!result.ok) return apiError('not_found', 'That code is not valid.', 404);

  // The app needs the workspace list up front to render its switcher, and
  // fetching it here saves a round trip on a screen the user is watching.
  const region = code.slice(0, code.indexOf('-'));
  const memberships = await listMemberships(region, result.userId);

  // The only time the secret is ever returned.
  return apiOk(
    {
      token: result.secret,
      device: result.device,
      workspaces: memberships.map((m) => ({
        id: m.workspaceId,
        name: m.workspaceName,
        role: m.role
      })),
      defaultWorkspaceId: result.workspaceId ?? memberships[0]?.workspaceId ?? null
    },
    { status: 201 }
  );
};
