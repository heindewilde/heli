import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { stopTimer } from '$lib/server/time';

/** Stopping when nothing is running is a no-op, not an error. */
export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const entry = await stopTimer(s);
  return json({ entry });
};
