import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { deleteCollectionSync } from '$lib/server/sync';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  await deleteCollectionSync(s, params.id!);
  return new Response(null, { status: 204 });
};
