import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  addItemToPipeline,
  updatePipelineItem,
  removePipelineItem,
  isMemberKind
} from '$lib/server/pipelines';

type AddBody = { kind?: unknown; refId?: unknown; stageId?: unknown };
type PatchBody = {
  itemId?: unknown;
  note?: unknown;
  valueCents?: unknown;
  currency?: unknown;
};
type DeleteBody = { itemId?: unknown };

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: AddBody;
  try {
    body = (await request.json()) as AddBody;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  const stageId = typeof body.stageId === 'string' ? body.stageId : undefined;
  try {
    const result = await addItemToPipeline(
      locals.user.id,
      locals.user.region,
      params.id!,
      { kind: body.kind, refId: body.refId, stageId }
    );
    return json(result, { status: result.alreadyExisted ? 200 : 201 });
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
  if (typeof body.itemId !== 'string') throw error(400, 'missing_itemId');
  const updates: { note?: string | null; valueCents?: number | null; currency?: string | null } = {};
  if (body.note !== undefined) {
    updates.note = body.note === null ? null : typeof body.note === 'string' ? body.note : null;
  }
  if (body.valueCents !== undefined) {
    updates.valueCents = body.valueCents === null
      ? null
      : typeof body.valueCents === 'number'
        ? body.valueCents
        : null;
  }
  if (body.currency !== undefined) {
    updates.currency = body.currency === null
      ? null
      : typeof body.currency === 'string'
        ? body.currency
        : null;
  }
  try {
    await updatePipelineItem(
      locals.user.id,
      locals.user.region,
      params.id!,
      body.itemId,
      updates
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};

export const DELETE: RequestHandler = async ({ request, url, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let itemId: string | null = url.searchParams.get('itemId');
  if (!itemId) {
    try {
      const body = (await request.json()) as DeleteBody;
      if (typeof body.itemId === 'string') itemId = body.itemId;
    } catch {
      // body optional
    }
  }
  if (!itemId) throw error(400, 'missing_itemId');
  try {
    await removePipelineItem(locals.user.id, locals.user.region, params.id!, itemId);
    return new Response(null, { status: 204 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
