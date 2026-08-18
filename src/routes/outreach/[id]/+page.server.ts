import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { getTemplate } from '$lib/server/outreach';
import { sampleCompanyRecipient, sampleRecipient } from '$lib/server/outreach-sample';
import { listCollections } from '$lib/server/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const [template, sample, companySample, collections] = await Promise.all([
    getTemplate(s, params.id),
    sampleRecipient(s),
    sampleCompanyRecipient(s),
    listCollections(s, { archived: 'active', limit: 100 })
  ]);
  if (!template) throw error(404, 'not_found');

  return {
    template,
    sample,
    companySample,
    collections: collections.map((c) => ({ id: c.id, name: c.name })),
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
