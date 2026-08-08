// Load-more endpoint for /companies — mirrors /api/people/list.
// Only valid for the default unfiltered, sort=recent view.

import { type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { requireScope } from '$lib/server/scope';
import {
  COMPANY_ROW_COLS,
  companyLastInteractionJoin,
  type CompanyRow
} from '$lib/server/companies-rows';
import { decodeCursor, encodeCursor } from '$lib/server/cursor';
import { jsonWithEtag } from '$lib/server/cache';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async ({ url, locals, request }) => {
  const s = requireScope(locals);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const d = db(s.region);
  const LAST_INTERACTION_JOIN = companyLastInteractionJoin(s.workspaceId);

  const cursorClause = cursor
    ? sql`AND (c.created_at, c.id) < (${cursor.createdAt}, ${cursor.id})`
    : sql``;

  const rows = await d.all<CompanyRow>(sql`
    SELECT ${COMPANY_ROW_COLS}
    FROM companies c
    ${LAST_INTERACTION_JOIN}
    WHERE c.workspace_id = ${s.workspaceId}
      AND c.is_archived = 0
      ${cursorClause}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ${PAGE_SIZE + 1}
  `);

  let items = rows;
  let nextCursor: string | null = null;
  if (rows.length > PAGE_SIZE) {
    const last = rows[PAGE_SIZE - 1];
    nextCursor = encodeCursor(last.createdAt, last.id);
    items = rows.slice(0, PAGE_SIZE);
  }

  return jsonWithEtag(request, { items, nextCursor });
};
