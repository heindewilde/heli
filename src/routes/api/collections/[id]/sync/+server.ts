import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteCollectionSync } from '$lib/server/sync';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  await deleteCollectionSync(locals.user.id, locals.user.region, params.id!);
  return new Response(null, { status: 204 });
};
