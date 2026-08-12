import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { startTimer } from '$lib/server/time';

/**
 * Start the clock.
 *
 * Already idempotent without an `Idempotency-Key`, and for a better reason than
 * a cached response: `startTimer` leans on the `uq_time_entries_running`
 * partial unique index rather than reading first, and returns the existing
 * timer when one is already going. A read-then-write would race with the same
 * person's other device — which, for a feature whose whole point is "start on
 * a laptop, stop on a phone", is not a hypothetical.
 *
 * 200 with `alreadyRunning` rather than a conflict: the caller's intent ("I
 * want a timer going") is satisfied either way.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is a valid "just start the clock".
  }

  try {
    const result = await startTimer(s, body);
    return apiOk(result, { status: result.alreadyRunning ? 200 : 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such project.', 404);
    return apiError('invalid_request', msg, 400);
  }
};
