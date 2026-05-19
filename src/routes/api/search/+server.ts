import { error, type RequestHandler } from '@sveltejs/kit';
import { searchAll } from '$lib/server/search';
import { jsonWithEtag } from '$lib/server/cache';

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const q = url.searchParams.get('q') ?? '';
  const items = await searchAll(locals.user.id, locals.user.region, q, 5);
  return jsonWithEtag(request, { items });
};
