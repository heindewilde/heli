import { requireScope } from '$lib/server/scope';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPipeline } from '$lib/server/pipelines';
import { getPipelineSync } from '$lib/server/sync';
import { stageTemplateMap } from '$lib/server/outreach';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const [pipeline, sync, stageTemplates] = await Promise.all([
    getPipeline(s, params.id),
    getPipelineSync(s, params.id),
    stageTemplateMap(s, params.id)
  ]);
  if (!pipeline) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved =
    url.searchParams.get('just') === '1' && Date.now() - pipeline.createdAt < FRESH_GRACE_MS;

  return { pipeline, sync, stageTemplates, justSaved };
};
