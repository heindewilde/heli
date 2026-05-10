import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createPipeline, isPipelineView, isStageKind } from '$lib/server/pipelines';
import type { PipelineView, StageKind } from '$lib/server/schema';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth?next=/pipelines/new');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const description = String(data.get('description') ?? '').trim() || null;
    const viewRaw = String(data.get('defaultView') ?? 'kanban');
    const defaultView: PipelineView = isPipelineView(viewRaw) ? viewRaw : 'kanban';

    // Stage names + kinds come in as parallel CSV strings. If empty, the
    // server falls back to its default 4-stage scaffold.
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

    throw redirect(303, `/pipelines/${id}?just=1`);
  }
};
