import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createPipeline, isPipelineView, isStageKind, seedPipelineFromCollection } from '$lib/server/pipelines';
import { getCollection } from '$lib/server/collections';
import { createCollectionSync } from '$lib/server/sync';
import type { PageServerLoad } from './$types';
import type { PipelineView, StageKind } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
  const collectionId = url.searchParams.get('fromCollection');
  if (!collectionId || !locals.user) return { fromCollection: null };
  const collection = await getCollection(locals.user.id, locals.user.region, collectionId);
  if (!collection) return { fromCollection: null };
  const peopleCount = collection.members.filter((m) => m.kind === 'person').length;
  const companyCount = collection.members.filter((m) => m.kind === 'company').length;
  return {
    fromCollection: {
      id: collection.id,
      name: collection.name,
      peopleCount,
      companyCount
    }
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth?next=/pipelines/new');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const description = String(data.get('description') ?? '').trim() || null;
    const viewRaw = String(data.get('defaultView') ?? 'kanban');
    const defaultView: PipelineView = isPipelineView(viewRaw) ? viewRaw : 'kanban';

    const stageNames = String(data.get('stageNames') ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const stageKinds = String(data.get('stageKinds') ?? '')
      .split('|')
      .map((s) => s.trim());
    const initialStages =
      stageNames.length > 0
        ? stageNames.map((n, i) => {
            const k = stageKinds[i];
            const kind: StageKind = isStageKind(k) ? k : 'open';
            return { name: n, kind };
          })
        : undefined;

    let id: string;
    try {
      const result = await createPipeline(locals.user.id, locals.user.region, {
        name,
        description,
        defaultView,
        initialStages
      });
      id = result.id;
    } catch (err) {
      return fail(400, { error: (err as Error).message });
    }

    const fromCollectionId = String(data.get('fromCollectionId') ?? '').trim();
    if (fromCollectionId) {
      await seedPipelineFromCollection(locals.user.id, locals.user.region, id, fromCollectionId);
      if (data.get('syncWithCollection') === '1') {
        await createCollectionSync(locals.user.id, locals.user.region, fromCollectionId, id);
      }
    }

    throw redirect(303, `/pipelines/${id}?just=1`);
  }
};
