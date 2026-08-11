import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { sampleRecipient } from '$lib/server/outreach-sample';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  return {
    sample: await sampleRecipient(s),
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
