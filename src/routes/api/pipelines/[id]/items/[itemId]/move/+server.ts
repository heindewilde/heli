import { error, type RequestHandler } from '@sveltejs/kit';
import { moveItemToStage } from '$lib/server/pipelines';

type Body = { toStageId?: unknown };

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.toStageId !== 'string' || !body.toStageId) {
    throw error(400, 'missing_toStageId');
  }
  try {
    await moveItemToStage(
      locals.user.id,
      locals.user.region,
      params.id!,
      params.itemId!,
      body.toStageId
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
