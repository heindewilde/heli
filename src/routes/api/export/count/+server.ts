/**
 * How many rows `GET /api/export` would return for the same query string.
 *
 * Its own route rather than a `?count=1` flag on the export itself, so one URL
 * never returns either CSV or JSON depending on a parameter. It is a GET, so no
 * role decision is required — and it deliberately returns a number and nothing
 * else, which is strictly less than the export beside it already hands over.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { exportCount } from '$lib/server/export';
import { COMPANY_LIST, PERSON_LIST } from '$lib/server/list-filters';

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireScope(locals);
  const kind = url.searchParams.get('kind');
  if (kind !== 'people' && kind !== 'companies') throw error(400, 'invalid_kind');
  const count = await exportCount(
    s,
    kind === 'people' ? PERSON_LIST : COMPANY_LIST,
    url.searchParams
  );
  return json({ count });
};
