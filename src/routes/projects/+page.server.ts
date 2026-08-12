import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import {
  listProjects,
  countProjects,
  getCompaniesForProjects,
  type ProjectCompany
} from '$lib/server/projects-query';
import { PROJECT_STATUSES, type ProjectStatus } from '$lib/server/schema';
import { PROJECT_TYPES, type ProjectType } from '$lib/projectTypes';

function isStatusFilter(v: string | null): v is ProjectStatus | 'all' {
  return v === 'all' || (v != null && (PROJECT_STATUSES as readonly string[]).includes(v));
}

function isTypeFilter(v: string | null): v is ProjectType | 'all' {
  return v === 'all' || (v != null && (PROJECT_TYPES as readonly string[]).includes(v));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    return {
      items: [],
      q: '',
      status: 'active' as const,
      projectType: 'all' as const,
      sort: 'updated' as const,
      itemCompanies: {},
      total: 0
    };
  }
  const s = requireScope(locals);

  const q = url.searchParams.get('q')?.trim() ?? '';
  const statusParam = url.searchParams.get('status');
  const status: ProjectStatus | 'all' = isStatusFilter(statusParam) ? statusParam : 'active';
  const typeParam = url.searchParams.get('type');
  const projectType: ProjectType | 'all' = isTypeFilter(typeParam) ? typeParam : 'all';
  const sortParam = url.searchParams.get('sort');
  const sort =
    sortParam === 'recent' || sortParam === 'updated' || sortParam === 'name' || sortParam === 'endDate' || sortParam === 'lastInteraction'
      ? sortParam
      : 'updated';

  const filters = { q, status, projectType };

  // The count is of what the filters actually match, so "12" next to the
  // heading agrees with the list below it. It used to be a second full
  // listProjects({limit: 500}) that ignored the filters entirely and was read
  // only for its `.length`.
  const [items, total] = await Promise.all([
    listProjects(s, { ...filters, sort, limit: 50 }),
    countProjects(s, filters)
  ]);

  const companyMap = await getCompaniesForProjects(s, items.map((i) => i.id));

  const itemCompanies: Record<string, ProjectCompany[]> = {};
  for (const [k, v] of companyMap) itemCompanies[k] = v;

  return { items, q, status, projectType, sort, itemCompanies, total };
};
