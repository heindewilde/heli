import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import {
  COMPANY_ROW_COLS,
  companyLastInteractionJoin,
  fetchCompanyRow,
  type CompanyRow
} from '$lib/server/companies-rows';
import { decodeCursor, encodeCursor } from '$lib/server/cursor';
import { saveCompany } from '$lib/server/saveCompany';
import { sanitizePlainText } from '$lib/server/sanitize';
import { ftsQuery } from '$lib/server/search';

const MAX_LIMIT = 100;

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, MAX_LIMIT);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const q = url.searchParams.get('q')?.trim() ?? '';
  const fts = q ? ftsQuery(q) : null;

  const searchClause = fts
    ? sql`AND c.id IN (SELECT rowid FROM companies_fts WHERE companies_fts MATCH ${fts})`
    : sql``;
  const cursorClause = cursor
    ? sql`AND (c.created_at, c.id) < (${cursor.createdAt}, ${cursor.id})`
    : sql``;

  const rows = await db(s.region).all<CompanyRow>(sql`
    SELECT ${COMPANY_ROW_COLS}
    FROM companies c
    ${companyLastInteractionJoin(s.workspaceId)}
    WHERE c.workspace_id = ${s.workspaceId}
      ${searchClause}
      ${cursorClause}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ${limit + 1}
  `);

  const items = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

  return apiOk(items, { nextCursor });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  const name = sanitizePlainText(String(body.name ?? ''), 200);
  if (!name) return apiError('invalid_request', 'A name is required.', 400);

  const result = await saveCompany(s, (body.url as string) ?? null, {
    name,
    industry: body.industry ? sanitizePlainText(String(body.industry), 200) : null,
    location: body.location ? sanitizePlainText(String(body.location), 200) : null,
    description: body.description ? String(body.description) : null,
    notes: body.notes ? String(body.notes) : null
  });
  return apiOk(await fetchCompanyRow(s, result.id), { status: result.dedup ? 200 : 201 });
};
