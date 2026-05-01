import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInteraction } from '$lib/server/interactions-query';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const item = await getInteraction(locals.user.id, locals.user.region, params.id);
  if (!item) throw error(404, 'not_found');
  return { interaction: item };
};
