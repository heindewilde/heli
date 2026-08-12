import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { stopTimer } from '$lib/server/time';

/**
 * Stop whatever is running, if anything.
 *
 * Returns `null` rather than 404 when no timer is going: "stop" on an idle
 * clock is a no-op, not an error, and a phone replaying a queued stop after the
 * web already stopped it should not see a failure.
 */
export const POST: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'write');
  return apiOk(await stopTimer(s));
};
