import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPipeline } from '$lib/server/pipelines';
import { getPipelineSync } from '$lib/server/sync';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const [pipeline, sync] = await Promise.all([
    getPipeline(locals.user.id, locals.user.region, params.id),
    getPipelineSync(locals.user.id, locals.user.region, params.id)
  ]);
  if (!pipeline) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved =
    url.searchParams.get('just') === '1' && Date.now() - pipeline.createdAt < FRESH_GRACE_MS;

  return { pipeline, sync, justSaved };
};
