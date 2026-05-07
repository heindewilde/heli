import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteTag } from '$lib/server/tags';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  await deleteTag(locals.user.id, locals.user.region, params.id!);
  return new Response(null, { status: 204 });
};
