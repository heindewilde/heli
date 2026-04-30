import { redirect, type Actions } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
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
  } else {
    const filters = [eq(people.userId, locals.user.id)];
    if (!archived) filters.push(eq(people.isArchived, 0));
    if (favorite) filters.push(eq(people.isFavorite, 1));
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

  // Total counts (irrespective of filters) for the header.
  const totalRow = await d
    .select({ n: sql<number>`COUNT(*)` })
    .from(people)
    .where(and(eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
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

export const actions: Actions = {};
