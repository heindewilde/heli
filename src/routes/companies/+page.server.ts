import { redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
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
    const t = await findTagBySlug(locals.user.id, locals.user.region, 'company', tagSlug);
    if (t) {
      activeTag = { id: t.id, name: t.name, slug: t.slug };
      tagFilterIds = await entityIdsForTag(locals.user.id, locals.user.region, 'company', t.id);
      if (tagFilterIds.length === 0) {
        const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'company');
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
      id: string; name: string; description: string | null; url: string | null;
      domain: string | null; logoUrl: string | null; faviconUrl: string | null;
      industry: string | null; location: string | null;
      isFavorite: number; isArchived: number; source: string | null;
      createdAt: number; updatedAt: number;
    }>(sql`
      SELECT c.id, c.name, c.description, c.url, c.domain,
             c.logo_url AS logoUrl, c.favicon_url AS faviconUrl,
             c.industry, c.location,
             c.is_favorite AS isFavorite, c.is_archived AS isArchived,
             c.source, c.created_at AS createdAt, c.updated_at AS updatedAt
      FROM companies c
      JOIN companies_fts f ON f.rowid = c.rowid
      WHERE c.user_id = ${locals.user.id}
        AND f.companies_fts MATCH ${fts}
        ${archived ? sql`` : sql`AND c.is_archived = 0`}
        ${favorite ? sql`AND c.is_favorite = 1` : sql``}
      ORDER BY rank
      LIMIT 200
    `);
    if (tagFilterIds) {
      const set = new Set(tagFilterIds);
      items = items.filter((i) => set.has(i.id));
    }
  } else if (sort === 'lastInteraction') {
    const userId = locals.user.id;
    const tagFilter = tagFilterIds
      ? sql`AND c.id IN (${sql.join(
          tagFilterIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;
    items = await d.all<{
      id: string; name: string; description: string | null; url: string | null;
      domain: string | null; logoUrl: string | null; faviconUrl: string | null;
      industry: string | null; location: string | null;
      isFavorite: number; isArchived: number; source: string | null;
      createdAt: number; updatedAt: number;
    }>(sql`
      SELECT c.id, c.name, c.description, c.url, c.domain,
             c.logo_url AS logoUrl, c.favicon_url AS faviconUrl,
             c.industry, c.location,
             c.is_favorite AS isFavorite, c.is_archived AS isArchived,
             c.source, c.created_at AS createdAt, c.updated_at AS updatedAt,
             MAX(i.occurred_at) AS lastAt
      FROM companies c
      LEFT JOIN interactions i ON i.company_id = c.id AND i.user_id = ${userId}
      WHERE c.user_id = ${userId}
        ${archived ? sql`` : sql`AND c.is_archived = 0`}
        ${favorite ? sql`AND c.is_favorite = 1` : sql``}
        ${tagFilter}
      GROUP BY c.id
      ORDER BY (lastAt IS NULL), lastAt DESC, c.created_at DESC
      LIMIT 200
    `);
  } else {
    const filters = [eq(companies.userId, locals.user.id)];
    if (!archived) filters.push(eq(companies.isArchived, 0));
    if (favorite) filters.push(eq(companies.isFavorite, 1));
    if (tagFilterIds) filters.push(inArray(companies.id, tagFilterIds));
    const order =
      sort === 'name' ? companies.name : sort === 'updated' ? desc(companies.updatedAt) : desc(companies.createdAt);
    items = await d
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
        url: companies.url,
        domain: companies.domain,
        logoUrl: companies.logoUrl,
        faviconUrl: companies.faviconUrl,
        industry: companies.industry,
        location: companies.location,
        isFavorite: companies.isFavorite,
        isArchived: companies.isArchived,
        source: companies.source,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt
      })
      .from(companies)
      .where(and(...filters))
      .orderBy(order)
      .limit(200);
  }

  const totalRow = await d
    .select({ n: sql<number>`COUNT(*)` })
    .from(companies)
    .where(and(eq(companies.userId, locals.user.id), eq(companies.isArchived, 0)))
    .get();

  const tagMap = await getTagsForEntities(
    locals.user.id,
    locals.user.region,
    'company',
    items.map((i) => i.id)
  );
  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'company');

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
