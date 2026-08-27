import { requireScope } from '$lib/server/scope';
import { redirect, type Actions } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { getTagsForEntities, listTagsWithCounts } from '$lib/server/tags';
import { listStatuses } from '$lib/server/statuses';
import {
  PERSON_ROW_COLS,
  personLastInteractionJoin,
  type PersonRow
} from '$lib/server/people-rows';
import {
  PERSON_LIST,
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
  // with the companies loader and with /api/export so a filtered export and
  // this list cannot disagree. What stays here is what the export does *not*
  // want: cursor pagination, and the empty-tag early return below.
  const flt = parseListFilters(url.searchParams);
  const tagRes = await resolveTagFilter(s, PERSON_LIST, flt);
  const tagIds = tagFilterIds(tagRes);
  const activeTag = tagRes.kind === 'tag' ? tagRes.tag : null;

  const d = db(locals.user.region);

  // A tag that exists but has no members means an empty list, not "no filter".
  // Short-circuited so the main query never runs with an empty IN ().
  if (tagRes.kind === 'tag' && tagRes.ids.length === 0) {
    const [allTags, statuses] = await Promise.all([
      listTagsWithCounts(s, 'person'),
      listStatuses('person', s)
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

  const isDefaultView = isDefaultListView(flt, tagIds);
  const cl = listClauses(PERSON_LIST, flt, tagIds);
  const orderClause = listOrderClause(PERSON_LIST, flt.sort);

  const LAST_INTERACTION_JOIN = personLastInteractionJoin(s.workspaceId);

  // Peek one extra row to detect whether there's a next page worth of data
  // for the default unfiltered view (used to set `nextCursor` below).
  const fetchLimit = isDefaultView ? PAGE_SIZE + 1 : PAGE_SIZE;

  let items: PersonRow[];
  if (flt.fts) {
    items = await d.all<PersonRow>(sql`
      SELECT ${PERSON_ROW_COLS}
      FROM people p
      JOIN people_fts f ON f.rowid = p.rowid
      LEFT JOIN companies co ON co.id = p.company_id
      ${LAST_INTERACTION_JOIN}
      WHERE p.workspace_id = ${s.workspaceId}
        AND f.people_fts MATCH ${flt.fts}
        ${cl.archived}
        ${cl.favorite}
        ${cl.tagIn}
        ${cl.priority}
        ${cl.status}
      ORDER BY rank
      LIMIT ${fetchLimit}
    `);
  } else {
    items = await d.all<PersonRow>(sql`
      SELECT ${PERSON_ROW_COLS}
      FROM people p
      LEFT JOIN companies co ON co.id = p.company_id
      ${LAST_INTERACTION_JOIN}
      WHERE p.workspace_id = ${s.workspaceId}
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
      .from(people)
      .where(and(eq(people.workspaceId, s.workspaceId), eq(people.isArchived, 0)))
      .get(),
    getTagsForEntities(s, 'person', items.map((i) => i.id)),
    listTagsWithCounts(s, 'person'),
    listStatuses('person', s)
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

export const actions: Actions = {};
