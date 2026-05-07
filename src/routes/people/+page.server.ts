import { redirect, type Actions } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const archived = url.searchParams.get('archived') === '1';
  const favorite = url.searchParams.get('favorite') === '1';
  const sort = url.searchParams.get('sort') ?? 'recent';
  const tagSlug = url.searchParams.get('tag');

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
        // Short-circuit: no rows can match.
        const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'person');
        return {
          q,
          archived,
          favorite,
          sort,
          tag: activeTag,
          allTags,
          items: [],
          itemTags: {} as Record<string, { id: string; name: string; slug: string }[]>,
          total: 0
        };
      }
    }
  }

  let items;
  if (fts) {
    items = await d.all<{
      id: string; name: string; role: string | null; companyId: string | null;
      url: string | null; domain: string | null; avatarUrl: string | null;
      faviconUrl: string | null; isFavorite: number; isArchived: number;
      source: string | null; createdAt: number; updatedAt: number;
    }>(sql`
      SELECT p.id, p.name, p.role, p.company_id AS companyId, p.url, p.domain,
             p.avatar_url AS avatarUrl, p.favicon_url AS faviconUrl,
             p.is_favorite AS isFavorite, p.is_archived AS isArchived,
             p.source, p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM people p
      JOIN people_fts f ON f.rowid = p.rowid
      WHERE p.user_id = ${locals.user.id}
        AND f.people_fts MATCH ${fts}
        ${archived ? sql`` : sql`AND p.is_archived = 0`}
        ${favorite ? sql`AND p.is_favorite = 1` : sql``}
      ORDER BY rank
      LIMIT 200
    `);
    if (tagFilterIds) {
      const set = new Set(tagFilterIds);
      items = items.filter((i) => set.has(i.id));
    }
  } else {
    const filters = [eq(people.userId, locals.user.id)];
    if (!archived) filters.push(eq(people.isArchived, 0));
    if (favorite) filters.push(eq(people.isFavorite, 1));
    if (tagFilterIds) filters.push(inArray(people.id, tagFilterIds));
    const order =
      sort === 'name' ? people.name : sort === 'updated' ? desc(people.updatedAt) : desc(people.createdAt);
    items = await d
      .select({
        id: people.id,
        name: people.name,
        role: people.role,
        companyId: people.companyId,
        url: people.url,
        domain: people.domain,
        avatarUrl: people.avatarUrl,
        faviconUrl: people.faviconUrl,
        isFavorite: people.isFavorite,
        isArchived: people.isArchived,
        source: people.source,
        createdAt: people.createdAt,
        updatedAt: people.updatedAt
      })
      .from(people)
      .where(and(...filters))
      .orderBy(order)
      .limit(200);
  }

  const totalRow = await d
    .select({ n: sql<number>`COUNT(*)` })
    .from(people)
    .where(and(eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
    .get();

  const tagMap = await getTagsForEntities(
    locals.user.id,
    locals.user.region,
    'person',
    items.map((i) => i.id)
  );
  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'person');

  return {
    q,
    archived,
    favorite,
    sort,
    tag: activeTag,
    allTags,
    items,
    itemTags,
    total: Number(totalRow?.n ?? 0)
  };
};

export const actions: Actions = {};
