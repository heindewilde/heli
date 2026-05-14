import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getCollection } from '$lib/server/collections';
import { getCollectionSync } from '$lib/server/sync';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const [collection, sync] = await Promise.all([
    getCollection(locals.user.id, locals.user.region, params.id),
    getCollectionSync(locals.user.id, locals.user.region, params.id)
  ]);
  if (!collection) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved =
    url.searchParams.get('just') === '1' && Date.now() - collection.createdAt < FRESH_GRACE_MS;

  return { collection, sync, justSaved };
};
