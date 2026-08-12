import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { countProjects, listProjects } from '$lib/server/projects-query';
import { createProject } from '$lib/server/saveProject';
import { isProjectType, PROJECT_STATUSES } from '$lib/server/schema';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Projects.
 *
 * No cursor, matching the web list: `listProjects` supports five sorts and a
 * search branch that orders by FTS rank, and the `(created_at, id)` cursor in
 * `cursor.ts` only applies to the default ordering. A second cursor format for
 * one resource is worse than the honest limit — filters narrow instead, which
 * is how the web page works too. The `total` is a real filtered count, so a
 * client can say "50 of 214" rather than implying there are 50.
 */

const MAX_LIMIT = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const status = url.searchParams.get('status') ?? 'active';
  const projectType = url.searchParams.get('type') ?? 'all';

  const filters = {
    q: url.searchParams.get('q') ?? undefined,
    status: (status === 'all' || (PROJECT_STATUSES as readonly string[]).includes(status)
      ? status
      : 'active') as never,
    projectType: (projectType === 'all' || isProjectType(projectType)
      ? projectType
      : 'all') as never,
    personId: url.searchParams.get('personId') ?? undefined,
    companyId: url.searchParams.get('companyId') ?? undefined,
    sort: (url.searchParams.get('sort') ?? 'updated') as never,
    limit: Math.min(Number(url.searchParams.get('limit')) || 50, MAX_LIMIT)
  };

  const [items, total] = await Promise.all([
    listProjects(s, filters),
    countProjects(s, filters)
  ]);
  return apiOk({ items, total });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return apiError('invalid_request', '`name` is required.', 400);
  }

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      return apiOk(await createProject(s, body as never), { status: 201 });
    } catch (err) {
      return apiError('invalid_request', (err as Error).message, 400);
    }
  });
};
