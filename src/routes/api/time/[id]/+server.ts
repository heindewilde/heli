import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteEntry, updateEntry } from '$lib/server/time';

/**
 * `updateEntry` and `deleteEntry` enforce "your own, unless you are an admin"
 * themselves — they call `requireRole`, which throws 403 before any write. That
 * is deliberately not a route-level gate: the same endpoint serves a member
 * correcting their own afternoon and an admin fixing a timesheet.
 */
function fail(err: unknown): never {
  const e = err as Error & { status?: number };
  // A 403 thrown by requireRole is already a SvelteKit HttpError; don't
  // re-wrap it as a 400.
  if (typeof e.status === 'number') throw e;
  throw error(e.message === 'not_found' ? 404 : 400, e.message);
}

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    await updateEntry(s, params.id!, body);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  try {
    await deleteEntry(s, params.id!);
  } catch (err) {
    fail(err);
  }
  return new Response(null, { status: 204 });
};
