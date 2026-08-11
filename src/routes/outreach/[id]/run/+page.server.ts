import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { getTemplate } from '$lib/server/outreach';
import { collectionRecipients, stageRecipients } from '$lib/server/outreach-recipients';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const template = await getTemplate(s, params.id);
  if (!template) throw error(404, 'not_found');

  const collectionId = url.searchParams.get('collection');
  const stageId = url.searchParams.get('stage');

  const source = collectionId
    ? await collectionRecipients(s, collectionId)
    : stageId
      ? await stageRecipients(s, stageId)
      : null;
  if (!source) throw error(404, 'source_not_found');

  return {
    template,
    sourceName: source.name,
    people: source.people,
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
