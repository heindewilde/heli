import { redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { ftsQuery } from '$lib/server/search';
import {
  entityIdsForTag,
  findTagBySlug,
  getTagsForEntities,
  listTagsWithCounts
} from '$lib/server/tags';
import { listStatuses } from '$lib/server/statuses';
import { sqlOr } from '$lib/server/sql-helpers';

const SORTS = new Set(['recent', 'updated', 'name', 'lastInteraction', 'priority', 'status']);

function parsePriorityFilter(raw: string | null): Set<number | null> | null {
  if (!raw) return null;
  const set = new Set<number | null>();
  for (const v of raw.split(',')) {
    const t = v.trim();
    if (t === 'none') set.add(null);
    else if (t === '1' || t === '2' || t === '3') set.add(Number.parseInt(t, 10));
  }
  return set.size > 0 ? set : null;
}

function parseStatusFilter(raw: string | null): Set<string> | null {
  if (!raw) return null;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return set.size > 0 ? set : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const archived = url.searchParams.get('archived') === '1';
  const favorite = url.searchParams.get('favorite') === '1';
  const sortParam = url.searchParams.get('sort') ?? 'recent';
  const sort = SORTS.has(sortParam) ? sortParam : 'recent';
  const tagSlug = url.searchParams.get('tag');
  const priorityFilter = parsePriorityFilter(url.searchParams.get('priority'));
  const statusFilter = parseStatusFilter(url.searchParams.get('status'));

  const d = db(locals.user.region);
  const fts = ftsQuery(q);

  let activeTag: { id: string; name: string; slug: string } | null = null;
  let tagFilterIds: string[] | null = null;
  if (tagSlug) {
    const t = await findTagBySlug(locals.user.id, locals.user.region, 'company', tagSlug);
    if (t) {
      activeTag = { id: t.id, name: t.name, slug: t.slug };
      tagFilterIds = await entityIdsForTag(locals.user.id, locals.user.region, 'company', t.id);
      if (tagFilterIds.length === 0) {
        const [allTags, statuses] = await Promise.all([
          listTagsWithCounts(locals.user.id, locals.user.region, 'company'),
          listStatuses('company', locals.user.id, locals.user.region)
        ]);
        return {
          q,
          archived,
          favorite,
          sort,
          priorityFilter: priorityFilter ? [...priorityFilter] : null,
          statusFilter: statusFilter ? [...statusFilter] : null,
          tag: activeTag,
          allTags,
          statuses,
          items: [],
          itemTags: {} as Record<string, { id: string; name: string; slug: string }[]>,
          total: 0
        };
      }
    }
  }

  type Row = {
    id: string;
    name: string;
    description: string | null;
    url: string | null;
    domain: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    industry: string | null;
    sizeBand: string | null;
    location: string | null;
    priority: number | null;
    statusId: string | null;
    isFavorite: number;
    isArchived: number;
    source: string | null;
    createdAt: number;
    updatedAt: number;
    lastAt: number | null;
  };

  const SELECT_COLS = sql`
    c.id, c.name, c.description, c.url, c.domain,
    c.logo_url AS logoUrl, c.favicon_url AS faviconUrl,
    c.industry, c.size_band AS sizeBand, c.location,
    c.priority, c.status_id AS statusId,
    c.is_favorite AS isFavorite, c.is_archived AS isArchived,
    c.source, c.created_at AS createdAt, c.updated_at AS updatedAt,
    li.last_at AS lastAt
  `;

  const userId = locals.user.id;
  const tagInClause = tagFilterIds
    ? sql`AND c.id IN (${sql.join(
        tagFilterIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    : sql``;

  const priorityClause = priorityFilter
    ? sqlOr([
        priorityFilter.has(null) ? sql`c.priority IS NULL` : null,
        ...[...priorityFilter]
          .filter((v): v is number => v !== null)
          .map((n) => sql`c.priority = ${n}`)
      ])
    : sql``;
  const statusClause = statusFilter
    ? sqlOr([
        statusFilter.has('none') ? sql`c.status_id IS NULL` : null,
        ...[...statusFilter].filter((v) => v !== 'none').map((id) => sql`c.status_id = ${id}`)
      ])
    : sql``;

  // Companies link directly to interactions via i.company_id (no junction
  // table on this side).
  const LAST_INTERACTION_JOIN = sql`
    LEFT JOIN (
      SELECT i.company_id AS cid, MAX(i.occurred_at) AS last_at
      FROM interactions i
      WHERE i.user_id = ${userId}
      GROUP BY i.company_id
    ) li ON li.cid = c.id
  `;

  let orderClause;
  if (sort === 'name') orderClause = sql`c.name COLLATE NOCASE ASC`;
  else if (sort === 'updated') orderClause = sql`c.updated_at DESC`;
  else if (sort === 'lastInteraction') orderClause = sql`(li.last_at IS NULL), li.last_at DESC, c.created_at DESC`;
  else if (sort === 'priority') orderClause = sql`(c.priority IS NULL), c.priority ASC, c.created_at DESC`;
  else if (sort === 'status') orderClause = sql`(c.status_id IS NULL), c.status_id ASC, c.created_at DESC`;
  else orderClause = sql`c.created_at DESC`;

  let items: Row[];
  if (fts) {
    items = await d.all<Row>(sql`
      SELECT ${SELECT_COLS}
      FROM companies c
      JOIN companies_fts f ON f.rowid = c.rowid
      ${LAST_INTERACTION_JOIN}
      WHERE c.user_id = ${userId}
        AND f.companies_fts MATCH ${fts}
        ${archived ? sql`` : sql`AND c.is_archived = 0`}
        ${favorite ? sql`AND c.is_favorite = 1` : sql``}
        ${tagInClause}
        ${priorityClause}
        ${statusClause}
      ORDER BY rank
      LIMIT 200
    `);
  } else {
    items = await d.all<Row>(sql`
      SELECT ${SELECT_COLS}
      FROM companies c
      ${LAST_INTERACTION_JOIN}
      WHERE c.user_id = ${userId}
        ${archived ? sql`` : sql`AND c.is_archived = 0`}
        ${favorite ? sql`AND c.is_favorite = 1` : sql``}
        ${tagInClause}
        ${priorityClause}
        ${statusClause}
      ORDER BY ${orderClause}
      LIMIT 200
    `);
  }

  // Four independent reads; fan out to cut libSQL round-trips.
  const [totalRow, tagMap, allTags, statuses] = await Promise.all([
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(companies)
      .where(and(eq(companies.userId, locals.user.id), eq(companies.isArchived, 0)))
      .get(),
    getTagsForEntities(locals.user.id, locals.user.region, 'company', items.map((i) => i.id)),
    listTagsWithCounts(locals.user.id, locals.user.region, 'company'),
    listStatuses('company', locals.user.id, locals.user.region)
  ]);
  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  return {
    q,
    archived,
    favorite,
    sort,
    priorityFilter: priorityFilter ? [...priorityFilter] : null,
    statusFilter: statusFilter ? [...statusFilter] : null,
    tag: activeTag,
    allTags,
    statuses,
    items,
    itemTags,
    total: Number(totalRow?.n ?? 0)
  };
};
