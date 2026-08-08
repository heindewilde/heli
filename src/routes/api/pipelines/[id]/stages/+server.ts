import { requireScope, requireRole } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { addStage, updateStage, deleteStage, reorderStages } from '$lib/server/pipelines';

type AddBody = { name?: unknown; color?: unknown; position?: unknown };
type PatchBody = {
  stageId?: unknown;
  name?: unknown;
  color?: unknown;
  /** Alternate form: pass `order: string[]` to reorder. */
  order?: unknown;
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.name !== 'string') throw error(400, 'missing_name');
  try {
    const result = await addStage(s, params.id!, {
      name: body.name,
      color: typeof body.color === 'string' ? body.color : null,
      position: typeof body.position === 'number' ? body.position : undefined
    });
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    throw error(400, 'invalid_json');
  }

  if (Array.isArray(body.order) && body.order.every((s) => typeof s === 'string')) {
    // Reordering rewrites the board for everyone; renaming or recolouring a
    // single stage below stays open to members.
    requireRole(s, 'owner', 'admin');
    try {
      await reorderStages(
        s,
        params.id!,
        body.order as string[]
      );
      return new Response(null, { status: 204 });
    } catch (err) {
      throw error(400, (err as Error).message);
    }
  }

  if (typeof body.stageId !== 'string') throw error(400, 'missing_stageId');
  const updates: { name?: string; color?: string | null } = {};
  if (typeof body.name === 'string') updates.name = body.name;
  if ('color' in body) updates.color = typeof body.color === 'string' ? body.color : null;
  try {
    await updateStage(
      s,
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
  const s = requireScope(locals);
  // Deletes a stage and bulk-reassigns its items. Admin-only.
  requireRole(s, 'owner', 'admin');
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
      s,
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
