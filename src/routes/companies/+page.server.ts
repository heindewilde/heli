import { redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { ftsQuery } from '$lib/server/search';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const archived = url.searchParams.get('archived') === '1';
  const favorite = url.searchParams.get('favorite') === '1';
  const sort = url.searchParams.get('sort') ?? 'recent';

  const d = db(locals.user.region);
  const fts = ftsQuery(q);

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
  } else {
    const filters = [eq(companies.userId, locals.user.id)];
    if (!archived) filters.push(eq(companies.isArchived, 0));
    if (favorite) filters.push(eq(companies.isFavorite, 1));
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

  return {
    q,
    archived,
    favorite,
    sort,
    items,
    total: Number(totalRow?.n ?? 0)
  };
};
