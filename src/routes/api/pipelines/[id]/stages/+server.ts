import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  addStage,
  updateStage,
  deleteStage,
  reorderStages,
  isStageKind
} from '$lib/server/pipelines';

type AddBody = { name?: unknown; kind?: unknown; position?: unknown };
type PatchBody = {
  stageId?: unknown;
  name?: unknown;
  kind?: unknown;
  /** Alternate form: pass `order: string[]` to reorder. */
  order?: unknown;
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.name !== 'string') throw error(400, 'missing_name');
  if (!isStageKind(body.kind)) throw error(400, 'invalid_kind');
  try {
    const result = await addStage(locals.user.id, locals.user.region, params.id!, {
      name: body.name,
      kind: body.kind,
      position: typeof body.position === 'number' ? body.position : undefined
    });
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    throw error(400, 'invalid_json');
  }

  if (Array.isArray(body.order) && body.order.every((s) => typeof s === 'string')) {
    try {
      await reorderStages(
        locals.user.id,
        locals.user.region,
        params.id!,
        body.order as string[]
      );
      return new Response(null, { status: 204 });
    } catch (err) {
      throw error(400, (err as Error).message);
    }
  }

  if (typeof body.stageId !== 'string') throw error(400, 'missing_stageId');
  const updates: { name?: string; kind?: 'open' | 'won' | 'lost' } = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if (body.kind !== undefined) {
    if (!isStageKind(body.kind)) throw error(400, 'invalid_kind');
    updates.kind = body.kind;
  }
  try {
    await updateStage(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.stageId,
      updates
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};

export const DELETE: RequestHandler = async ({ url, request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const stageId = url.searchParams.get('stageId');
  const moveTo = url.searchParams.get('moveTo');
  let stageIdFinal = stageId;
  let moveToFinal = moveTo;
  if (!stageIdFinal) {
    try {
      const body = (await request.json()) as { stageId?: unknown; moveTo?: unknown };
      if (typeof body.stageId === 'string') stageIdFinal = body.stageId;
      if (typeof body.moveTo === 'string') moveToFinal = body.moveTo;
    } catch {
      // Body is optional; query string can carry both params.
    }
  }
  if (!stageIdFinal) throw error(400, 'missing_stageId');
  try {
    await deleteStage(
      locals.user.id,
      locals.user.region,
      params.id!,
      stageIdFinal,
      moveToFinal
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'stage_has_items') throw error(409, 'stage_has_items');
    throw error(400, msg);
  }
};
