import { requireScope } from '$lib/server/scope';
import { redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { getTagsForEntities, listTagsWithCounts } from '$lib/server/tags';
import { listStatuses } from '$lib/server/statuses';
import {
  COMPANY_ROW_COLS,
  companyLastInteractionJoin,
  type CompanyRow
} from '$lib/server/companies-rows';
import {
  COMPANY_LIST,
  isDefaultListView,
  listClauses,
  listOrderClause,
  parseListFilters,
  resolveTagFilter,
  tagFilterIds
} from '$lib/server/list-filters';
import { encodeCursor } from '$lib/server/cursor';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const s = requireScope(locals);

  // Parsing and every WHERE fragment live in $lib/server/list-filters, shared
  // with the people loader and with /api/export so a filtered export and this
  // list cannot disagree. Cursor pagination and the empty-tag early return stay
  // here — the export wants neither.
  const flt = parseListFilters(url.searchParams);
  const tagRes = await resolveTagFilter(s, COMPANY_LIST, flt);
  const tagIds = tagFilterIds(tagRes);
  const activeTag = tagRes.kind === 'tag' ? tagRes.tag : null;

  const d = db(locals.user.region);

  // A tag that exists but has no members means an empty list, not "no filter".
  if (tagRes.kind === 'tag' && tagRes.ids.length === 0) {
    const [allTags, statuses] = await Promise.all([
      listTagsWithCounts(s, 'company'),
      listStatuses('company', s)
    ]);
    return {
      q: flt.q,
      archived: flt.includeArchived,
      favorite: flt.favorite,
      sort: flt.sort,
      priorityFilter: flt.priority ? [...flt.priority] : null,
      statusFilter: flt.status ? [...flt.status] : null,
      tag: activeTag,
      allTags,
      statuses,
      items: [],
      itemTags: {} as Record<string, { id: string; name: string; slug: string }[]>,
      total: 0,
      nextCursor: null
    };
  }

  // Only the default unfiltered view exposes a cursor for Load More.
  const isDefaultView = isDefaultListView(flt, tagIds);
  const cl = listClauses(COMPANY_LIST, flt, tagIds);
  const orderClause = listOrderClause(COMPANY_LIST, flt.sort);

  const LAST_INTERACTION_JOIN = companyLastInteractionJoin(s.workspaceId);

  const fetchLimit = isDefaultView ? PAGE_SIZE + 1 : PAGE_SIZE;

  let items: CompanyRow[];
  if (flt.fts) {
    items = await d.all<CompanyRow>(sql`
      SELECT ${COMPANY_ROW_COLS}
      FROM companies c
      JOIN companies_fts f ON f.rowid = c.rowid
      ${LAST_INTERACTION_JOIN}
      WHERE c.workspace_id = ${s.workspaceId}
        AND f.companies_fts MATCH ${flt.fts}
        ${cl.archived}
        ${cl.favorite}
        ${cl.tagIn}
        ${cl.priority}
        ${cl.status}
      ORDER BY rank
      LIMIT ${fetchLimit}
    `);
  } else {
    items = await d.all<CompanyRow>(sql`
      SELECT ${COMPANY_ROW_COLS}
      FROM companies c
      ${LAST_INTERACTION_JOIN}
      WHERE c.workspace_id = ${s.workspaceId}
        ${cl.archived}
        ${cl.favorite}
        ${cl.tagIn}
        ${cl.priority}
        ${cl.status}
      ORDER BY ${orderClause}
      LIMIT ${fetchLimit}
    `);
  }

  let nextCursor: string | null = null;
  if (isDefaultView && items.length > PAGE_SIZE) {
    const lastVisible = items[PAGE_SIZE - 1];
    nextCursor = encodeCursor(lastVisible.createdAt, lastVisible.id);
    items = items.slice(0, PAGE_SIZE);
  }

  // Four independent reads; fan out to cut libSQL round-trips.
  const [totalRow, tagMap, allTags, statuses] = await Promise.all([
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(companies)
      .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.isArchived, 0)))
      .get(),
    getTagsForEntities(s, 'company', items.map((i) => i.id)),
    listTagsWithCounts(s, 'company'),
    listStatuses('company', s)
  ]);
  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  return {
    q: flt.q,
    archived: flt.includeArchived,
    favorite: flt.favorite,
    sort: flt.sort,
    priorityFilter: flt.priority ? [...flt.priority] : null,
    statusFilter: flt.status ? [...flt.status] : null,
    tag: activeTag,
    allTags,
    statuses,
    items,
    itemTags,
    total: Number(totalRow?.n ?? 0),
    nextCursor
  };
};
