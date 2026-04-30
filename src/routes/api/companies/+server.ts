import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { ftsQuery } from '$lib/server/search';
import { saveCompany, type ManualCompanyInput } from '$lib/server/saveCompany';
import { sanitizePlainText } from '$lib/server/sanitize';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100);
  const includeArchived = url.searchParams.get('archived') === '1';
  const favOnly = url.searchParams.get('favorite') === '1';

  const d = db(locals.user.region);
  const fts = ftsQuery(q);

  let rows;
  if (fts) {
    rows = await d.all<{
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
        ${includeArchived ? sql`` : sql`AND c.is_archived = 0`}
        ${favOnly ? sql`AND c.is_favorite = 1` : sql``}
      ORDER BY rank
      LIMIT ${limit}
    `);
  } else {
    const filters = [eq(companies.userId, locals.user.id)];
    if (!includeArchived) filters.push(eq(companies.isArchived, 0));
    if (favOnly) filters.push(eq(companies.isFavorite, 1));
    rows = await d
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
      .orderBy(desc(companies.createdAt))
      .limit(limit);
  }

  return json({ items: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Partial<ManualCompanyInput>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const name = sanitizePlainText(String(body.name ?? ''), 200);
  if (!name) throw error(400, 'missing_name');
  const result = await saveCompany(locals.user.id, locals.user.region, null, {
    name,
    industry: body.industry ? sanitizePlainText(String(body.industry), 200) : null,
    location: body.location ? sanitizePlainText(String(body.location), 200) : null,
    description: body.description ? String(body.description) : null,
    notes: body.notes ? String(body.notes) : null
  });
  return json(result, { status: 201 });
};
