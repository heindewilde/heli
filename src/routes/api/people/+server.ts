import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { ftsQuery } from '$lib/server/search';
import { savePerson, type ManualPersonInput } from '$lib/server/savePerson';
import { sanitizePlainText } from '$lib/server/sanitize';
import { jsonWithEtag } from '$lib/server/cache';

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100);
  const includeArchived = url.searchParams.get('archived') === '1';
  const favOnly = url.searchParams.get('favorite') === '1';
  const companyId = url.searchParams.get('companyId');

  const d = db(locals.user.region);
  const fts = ftsQuery(q);

  let rows;
  if (fts) {
    rows = await d.all<{
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
      WHERE p.workspace_id = ${s.workspaceId}
        AND f.people_fts MATCH ${fts}
        ${includeArchived ? sql`` : sql`AND p.is_archived = 0`}
        ${favOnly ? sql`AND p.is_favorite = 1` : sql``}
        ${companyId ? sql`AND p.company_id = ${companyId}` : sql``}
      ORDER BY rank
      LIMIT ${limit}
    `);
  } else {
    const filters = [eq(people.workspaceId, s.workspaceId)];
    if (!includeArchived) filters.push(eq(people.isArchived, 0));
    if (favOnly) filters.push(eq(people.isFavorite, 1));
    if (companyId) filters.push(eq(people.companyId, companyId));
    rows = await d
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
      .orderBy(desc(people.createdAt))
      .limit(limit);
  }

  return jsonWithEtag(request, { items: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Partial<ManualPersonInput>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const name = sanitizePlainText(String(body.name ?? ''), 200);
  if (!name) throw error(400, 'missing_name');
  const result = await savePerson(s, null, {
    name,
    role: body.role ? sanitizePlainText(String(body.role), 200) : null,
    companyId: body.companyId ? String(body.companyId) : null,
    email: body.email ? sanitizePlainText(String(body.email), 254) : null,
    phone: body.phone ? sanitizePlainText(String(body.phone), 64) : null,
    location: body.location ? sanitizePlainText(String(body.location), 200) : null,
    notes: body.notes ? String(body.notes) : null
  });
  return json(result, { status: 201 });
};
