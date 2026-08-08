import { requireScope } from '$lib/server/scope';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProject } from '$lib/server/projects-query';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const project = await getProject(s, params.id);
  if (!project) throw error(404, 'not_found');

  // SaveBanner flags. ?just stays valid until the entity is older than 30s
  // (gives the client a buffer over its 6s undo countdown).
  const FRESH_GRACE_MS = 30_000;
  const justSaved = url.searchParams.get('just') === '1' && Date.now() - project.createdAt < FRESH_GRACE_MS;

  return { project, justSaved };
};
