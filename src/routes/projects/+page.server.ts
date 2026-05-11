import type { PageServerLoad } from './$types';
import { listProjects, getCompaniesForProjects, type ProjectCompany } from '$lib/server/projects-query';
import { entityIdsForTag, findTagBySlug, getTagsForEntities, listTagsWithCounts } from '$lib/server/tags';
import { PROJECT_STATUSES, type ProjectStatus } from '$lib/server/schema';

function isStatusFilter(v: string | null): v is ProjectStatus | 'all' {
  return v === 'all' || (v != null && (PROJECT_STATUSES as readonly string[]).includes(v));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // hooks.server.ts already redirects logged-out users for /projects/*.
  if (!locals.user) return { items: [], allTags: [], tag: null, q: '', status: 'active' as const, sort: 'updated' as const, itemTags: {}, itemCompanies: {}, total: 0 };

  const q = url.searchParams.get('q')?.trim() ?? '';
  const statusParam = url.searchParams.get('status');
  const status: ProjectStatus | 'all' = isStatusFilter(statusParam) ? statusParam : 'active';
  const sortParam = url.searchParams.get('sort');
  const sort =
    sortParam === 'recent' || sortParam === 'updated' || sortParam === 'name' || sortParam === 'endDate' || sortParam === 'lastInteraction'
      ? sortParam
      : 'updated';
  const tagSlug = url.searchParams.get('tag');

  let activeTag: { id: string; name: string; slug: string } | null = null;
  let tagFilterIds: string[] | null = null;
  if (tagSlug) {
    const t = await findTagBySlug(locals.user.id, locals.user.region, 'project', tagSlug);
    if (t) {
      activeTag = { id: t.id, name: t.name, slug: t.slug };
      tagFilterIds = await entityIdsForTag(locals.user.id, locals.user.region, 'project', t.id);
      if (tagFilterIds.length === 0) {
        const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'project');
        return {
          items: [],
          allTags,
          tag: activeTag,
          q,
          status,
          sort,
          itemTags: {} as Record<string, { id: string; name: string; slug: string }[]>,
          itemCompanies: {} as Record<string, ProjectCompany[]>,
          total: 0
        };
      }
    }
  }

  const items = await listProjects(locals.user.id, locals.user.region, {
    q,
    status,
    sort,
    tagFilterIds,
    limit: 200
  });

  const projectIds = items.map((i) => i.id);

  const [tagMap, companyMap] = await Promise.all([
    getTagsForEntities(locals.user.id, locals.user.region, 'project', projectIds),
    getCompaniesForProjects(locals.user.id, locals.user.region, projectIds)
  ]);

  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  const itemCompanies: Record<string, ProjectCompany[]> = {};
  for (const [k, v] of companyMap) itemCompanies[k] = v;

  const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'project');

  // Total = active count for the header pill.
  const totalActive = await listProjects(locals.user.id, locals.user.region, {
    status: 'active',
    sort: 'updated',
    limit: 500
  });

  return {
    items,
    allTags,
    tag: activeTag,
    q,
    status,
    sort,
    itemTags,
    itemCompanies,
    total: totalActive.length
  };
};
