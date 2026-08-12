import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { jsonWithEtag } from '$lib/server/cache';
import { createEntry, listTimeEntries, timeSummary, type TimeFilters } from '$lib/server/time';

/** Parsed once so GET's list and summary modes cannot filter differently. */
function readFilters(url: URL): TimeFilters {
  const num = (k: string) => {
    const v = Number(url.searchParams.get(k));
    return Number.isFinite(v) && url.searchParams.has(k) ? v : undefined;
  };
  const user = url.searchParams.get('user');
  const billable = url.searchParams.get('billable');
  return {
    userId: user === 'all' ? 'all' : (user ?? undefined),
    projectId: url.searchParams.get('project') ?? undefined,
    from: num('from'),
    to: num('to'),
    billable: billable == null ? undefined : billable === '1' || billable === 'true',
    limit: num('limit')
  };
}

export const GET: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const filters = readFilters(url);

  if (url.searchParams.get('view') === 'summary') {
    return jsonWithEtag(request, await timeSummary(s, filters));
  }
  return jsonWithEtag(request, { items: await listTimeEntries(s, filters) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    return json(await createEntry(s, body), { status: 201 });
  } catch (err) {
    const code = (err as Error).message;
    throw error(code === 'not_found' ? 404 : 400, code);
  }
};
