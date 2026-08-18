import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { getTemplate } from '$lib/server/outreach';
import { resolveAudience } from '$lib/server/outreach-recipients';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const template = await getTemplate(s, params.id);
  if (!template) throw error(404, 'not_found');

  const ids = url.searchParams.get('ids');
  /**
   * The audience kind follows the *template*, not the URL. Who a template can
   * be run against is decided by who it addresses — asking for a collection of
   * people with a company template would otherwise render a queue of empty
   * messages rather than saying so.
   */
  const source = await resolveAudience(s, template.target, {
    collectionId: url.searchParams.get('collection'),
    stageId: url.searchParams.get('stage'),
    ids: ids ? ids.split(',').filter(Boolean) : null
  });
  if (!source) throw error(404, 'source_not_found');

  return {
    template,
    sourceName: source.name,
    members: source.members,
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
