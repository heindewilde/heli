import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { parseBulkBody, runBulkAction } from '$lib/server/bulk';

/**
 * Bulk actions on selected companies. The action union, the id cap and the role
 * decision all live in `$lib/server/bulk`; this is only the wire.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }

  const { ids, action } = parseBulkBody(raw);
  return json(await runBulkAction(s, 'company', ids, action));
};
