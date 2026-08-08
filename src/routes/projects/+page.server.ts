import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import { listProjects, getCompaniesForProjects, type ProjectCompany } from '$lib/server/projects-query';
import { PROJECT_STATUSES, type ProjectStatus } from '$lib/server/schema';

function isStatusFilter(v: string | null): v is ProjectStatus | 'all' {
  return v === 'all' || (v != null && (PROJECT_STATUSES as readonly string[]).includes(v));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) return { items: [], q: '', status: 'active' as const, sort: 'updated' as const, itemCompanies: {}, total: 0 };
  const s = requireScope(locals);

  const q = url.searchParams.get('q')?.trim() ?? '';
  const statusParam = url.searchParams.get('status');
  const status: ProjectStatus | 'all' = isStatusFilter(statusParam) ? statusParam : 'active';
  const sortParam = url.searchParams.get('sort');
  const sort =
    sortParam === 'recent' || sortParam === 'updated' || sortParam === 'name' || sortParam === 'endDate' || sortParam === 'lastInteraction'
      ? sortParam
      : 'updated';

  const items = await listProjects(s, {
    q,
    status,
    sort,
    limit: 50
  });

  const projectIds = items.map((i) => i.id);

  const companyMap = await getCompaniesForProjects(s, projectIds);

  const itemCompanies: Record<string, ProjectCompany[]> = {};
  for (const [k, v] of companyMap) itemCompanies[k] = v;

  const totalActive = await listProjects(s, {
    status: 'active',
    sort: 'updated',
    limit: 500
  });

  return {
    items,
    q,
    status,
    sort,
    itemCompanies,
    total: totalActive.length
  };
};
