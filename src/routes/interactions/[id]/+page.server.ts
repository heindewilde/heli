import { requireScope } from '$lib/server/scope';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInteraction } from '$lib/server/interactions-query';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const s = requireScope(locals);
  const item = await getInteraction(s, params.id);
  if (!item) throw error(404, 'not_found');
  return { interaction: item };
};
