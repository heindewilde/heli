import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { getProjectHeader, getProjectLinks } from '$lib/server/projects-query';
import { deleteProject, updateProject } from '$lib/server/saveProject';
import { listAllocationsForProject } from '$lib/server/allocations';
import { listMilestones, listGoals } from '$lib/server/project-plan';

/**
 * One project, optionally with its sections.
 *
 * `?include=` is the mobile-shaped addition. The web page streams six sections
 * as unawaited promises, which is exactly right for SSR and useless over a
 * network: a phone wants one round trip, and the offline mirror wants one
 * atomic write. Every section here calls the same helper the page does, so this
 * is a new *shape*, not new queries.
 *
 * Unknown names are ignored rather than rejected, so a newer client asking for
 * a section an older server does not have degrades to missing data instead of
 * a failed request.
 */
const INCLUDABLE = ['links', 'milestones', 'goals', 'allocations'] as const;
type Includable = (typeof INCLUDABLE)[number];

export const GET: RequestHandler = async ({ params, url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const project = await getProjectHeader(s, params.id);
  if (!project) return apiError('not_found', 'No such project.', 404);

  const wanted = new Set(
    (url.searchParams.get('include') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v): v is Includable => (INCLUDABLE as readonly string[]).includes(v))
  );
  if (wanted.size === 0) return apiOk(project);

  const [links, milestones, goals, allocations] = await Promise.all([
    wanted.has('links') ? getProjectLinks(s, params.id) : Promise.resolve(undefined),
    wanted.has('milestones') ? listMilestones(s, params.id) : Promise.resolve(undefined),
    wanted.has('goals') ? listGoals(s, params.id) : Promise.resolve(undefined),
    wanted.has('allocations')
      ? listAllocationsForProject(s, params.id)
      : Promise.resolve(undefined)
  ]);

  return apiOk({ ...project, links, milestones, goals, allocations });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const existing = await getProjectHeader(s, params.id);
  if (!existing) return apiError('not_found', 'No such project.', 404);

  try {
    // Note `updateProject` applies BILLING_MONEY_FIELD: changing `billingType`
    // *clears* the money columns that type no longer owns. That is deliberate
    // on the server, and it means a client must never send `billingType`
    // incidentally — see the note in CLAUDE.md about the hourly rate this lost.
    await updateProject(s, params.id, body as never);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'no_updates') {
      return apiError('invalid_request', 'No writable fields supplied.', 400);
    }
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getProjectHeader(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const existing = await getProjectHeader(s, params.id);
  if (!existing) return apiError('not_found', 'No such project.', 404);
  await deleteProject(s, params.id);
  return apiOk({ id: params.id, deleted: true });
};
