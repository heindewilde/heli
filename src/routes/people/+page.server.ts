import { redirect, type Actions } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { ftsQuery } from '$lib/server/search';
import {
  entityIdsForTag,
  findTagBySlug,
  getTagsForEntities,
  listTagsWithCounts
} from '$lib/server/tags';
import { listStatuses } from '$lib/server/statuses';
import { sqlOr } from '$lib/server/sql-helpers';

// Allowed sort keys. Anything else falls back to 'recent'.
const SORTS = new Set(['recent', 'updated', 'name', 'lastInteraction', 'priority', 'status']);

function parsePriorityFilter(raw: string | null): Set<number | null> | null {
  // Accepts comma-separated subset of "1,2,3,none". Empty/missing = no filter.
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
  // Comma-separated status ids, with the sentinel "none" for "no status set".
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
    const t = await findTagBySlug(locals.user.id, locals.user.region, 'person', tagSlug);
    if (t) {
      activeTag = { id: t.id, name: t.name, slug: t.slug };
      tagFilterIds = await entityIdsForTag(locals.user.id, locals.user.region, 'person', t.id);
      if (tagFilterIds.length === 0) {
        const [allTags, statuses] = await Promise.all([
          listTagsWithCounts(locals.user.id, locals.user.region, 'person'),
          listStatuses('person', locals.user.id, locals.user.region)
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
    role: string | null;
    companyId: string | null;
    companyName: string | null;
    companyDomain: string | null;
    companyFaviconUrl: string | null;
    companyLogoUrl: string | null;
    url: string | null;
    domain: string | null;
    email: string | null;
    avatarUrl: string | null;
    faviconUrl: string | null;
    priority: number | null;
    statusId: string | null;
    isFavorite: number;
    isArchived: number;
    source: string | null;
    createdAt: number;
    updatedAt: number;
    lastAt: number | null;
  };

  // Single source of truth for the column projection. The two query branches
  // (FTS vs structured) both join the same companies left-join and the same
  // interaction-max subquery so the row shape is identical.
  const SELECT_COLS = sql`
    p.id, p.name, p.role, p.company_id AS companyId,
    co.name AS companyName, co.domain AS companyDomain,
    co.favicon_url AS companyFaviconUrl, co.logo_url AS companyLogoUrl,
    p.url, p.domain, p.email,
    p.avatar_url AS avatarUrl, p.favicon_url AS faviconUrl,
    p.priority, p.status_id AS statusId,
    p.is_favorite AS isFavorite, p.is_archived AS isArchived,
    p.source, p.created_at AS createdAt, p.updated_at AS updatedAt,
    li.last_at AS lastAt
  `;

  const userId = locals.user.id;
  const tagInClause = tagFilterIds
    ? sql`AND p.id IN (${sql.join(
        tagFilterIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    : sql``;

  const priorityClause = priorityFilter
    ? sqlOr([
        priorityFilter.has(null) ? sql`p.priority IS NULL` : null,
        ...[...priorityFilter]
          .filter((v): v is number => v !== null)
          .map((n) => sql`p.priority = ${n}`)
      ])
    : sql``;
  const statusClause = statusFilter
    ? sqlOr([
        statusFilter.has('none') ? sql`p.status_id IS NULL` : null,
        ...[...statusFilter].filter((v) => v !== 'none').map((id) => sql`p.status_id = ${id}`)
      ])
    : sql``;

  const LAST_INTERACTION_JOIN = sql`
    LEFT JOIN (
      SELECT ip.person_id AS pid, MAX(i.occurred_at) AS last_at
      FROM interaction_people ip
      JOIN interactions i ON i.id = ip.interaction_id AND i.user_id = ${userId}
      GROUP BY ip.person_id
    ) li ON li.pid = p.id
  `;

  // ORDER BY clause built per sort key. NULLs handled inline.
  let orderClause;
  if (sort === 'name') orderClause = sql`p.name COLLATE NOCASE ASC`;
  else if (sort === 'updated') orderClause = sql`p.updated_at DESC`;
  else if (sort === 'lastInteraction') orderClause = sql`(li.last_at IS NULL), li.last_at DESC, p.created_at DESC`;
  else if (sort === 'priority') orderClause = sql`(p.priority IS NULL), p.priority ASC, p.created_at DESC`;
  else if (sort === 'status') orderClause = sql`(p.status_id IS NULL), p.status_id ASC, p.created_at DESC`;
  else orderClause = sql`p.created_at DESC`;

  let items: Row[];
  if (fts) {
    items = await d.all<Row>(sql`
      SELECT ${SELECT_COLS}
      FROM people p
      JOIN people_fts f ON f.rowid = p.rowid
      LEFT JOIN companies co ON co.id = p.company_id
      ${LAST_INTERACTION_JOIN}
      WHERE p.user_id = ${userId}
        AND f.people_fts MATCH ${fts}
        ${archived ? sql`` : sql`AND p.is_archived = 0`}
        ${favorite ? sql`AND p.is_favorite = 1` : sql``}
        ${tagInClause}
        ${priorityClause}
        ${statusClause}
      ORDER BY rank
      LIMIT 50
    `);
  } else {
    items = await d.all<Row>(sql`
      SELECT ${SELECT_COLS}
      FROM people p
      LEFT JOIN companies co ON co.id = p.company_id
      ${LAST_INTERACTION_JOIN}
      WHERE p.user_id = ${userId}
        ${archived ? sql`` : sql`AND p.is_archived = 0`}
        ${favorite ? sql`AND p.is_favorite = 1` : sql``}
        ${tagInClause}
        ${priorityClause}
        ${statusClause}
      ORDER BY ${orderClause}
      LIMIT 50
    `);
  }

  // Four independent reads; fan out to cut libSQL round-trips.
  const [totalRow, tagMap, allTags, statuses] = await Promise.all([
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(people)
      .where(and(eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
      .get(),
    getTagsForEntities(locals.user.id, locals.user.region, 'person', items.map((i) => i.id)),
    listTagsWithCounts(locals.user.id, locals.user.region, 'person'),
    listStatuses('person', locals.user.id, locals.user.region)
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

export const actions: Actions = {};
