import { requireScope } from '$lib/server/scope';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollectionDetail } from '$lib/server/collections';
import { getCollectionSync } from '$lib/server/sync';

/**
 * Read `just` and nothing else out of the query string.
 *
 * SvelteKit tracks search-param dependencies per key, so a load that only
 * touches `just` is not re-run when `?kind=` changes — which is what makes the
 * page's People/Companies/All control instant and free. The moment anyone reads
 * `kind` here, every segment click costs a server round trip, and because the
 * feature still *works* nothing catches it. `e2e/collection-detail.spec.ts`
 * pins it by asserting the search box keeps its text across a segment click.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const [collection, sync] = await Promise.all([
    getCollectionDetail(s, params.id),
    getCollectionSync(s, params.id)
  ]);
  if (!collection) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved =
    url.searchParams.get('just') === '1' && Date.now() - collection.createdAt < FRESH_GRACE_MS;

  // `workspaceId` keys the page's localStorage view preference. It is not in
  // the root layout data, and adding it there is a wider decision than this
  // page needs.
  return { collection, sync, justSaved, workspaceId: s.workspaceId };
};
