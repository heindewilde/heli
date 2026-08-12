import { requireScope } from '$lib/server/scope';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  getProjectHeader,
  getProjectLinks,
  getProjectPeople,
  getProjectCompanies,
  getProjectInteractions,
  getProjectMilestones,
  getProjectGoals
} from '$lib/server/projects-query';
import { listAllocationsForProject, listMemberCapacities } from '$lib/server/allocations';

/**
 * Only the project row is awaited; everything else is returned unawaited so the
 * name, status and dates ship in the first bytes of HTML and each section fills
 * in as its query lands. Same pattern as /people/[id].
 *
 * This page used to await all six — and fetch every interaction ever linked to
 * the project, with no limit.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const project = await getProjectHeader(s, params.id);
  if (!project) throw error(404, 'not_found');

  // SaveBanner flags. ?just stays valid until the entity is older than 30s
  // (gives the client a buffer over its 6s undo countdown).
  const FRESH_GRACE_MS = 30_000;
  const justSaved = url.searchParams.get('just') === '1' && Date.now() - project.createdAt < FRESH_GRACE_MS;

  return {
    project,
    justSaved,
    links: getProjectLinks(s, params.id),
    people: getProjectPeople(s, params.id),
    companies: getProjectCompanies(s, params.id),
    interactions: getProjectInteractions(s, params.id),
    milestones: getProjectMilestones(s, params.id),
    goals: getProjectGoals(s, params.id),
    // Allocations and the member list always render together, so they resolve
    // as one promise rather than making the card wait on two.
    staffing: Promise.all([
      listAllocationsForProject(s, params.id),
      listMemberCapacities(s)
    ]).then(([allocations, members]) => ({ allocations, members }))
  };
};
