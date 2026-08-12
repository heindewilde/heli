import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { startTimer } from '$lib/server/time';

/**
 * Idempotent by design: if a timer is already running this returns it rather
 * than failing. Two tabs both pressing start should leave you with one timer
 * and no error — the caller's intent is satisfied either way.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is a valid "just start the clock".
  }

  try {
    const result = await startTimer(s, body);
    return json(result, { status: result.alreadyRunning ? 200 : 201 });
  } catch (err) {
    const code = (err as Error).message;
    throw error(code === 'not_found' ? 404 : 400, code);
  }
};
