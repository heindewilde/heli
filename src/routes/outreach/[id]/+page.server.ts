import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { getTemplate } from '$lib/server/outreach';
import { sampleRecipient } from '$lib/server/outreach-sample';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const [template, sample] = await Promise.all([
    getTemplate(s, params.id),
    sampleRecipient(s)
  ]);
  if (!template) throw error(404, 'not_found');

  return {
    template,
    sample,
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
