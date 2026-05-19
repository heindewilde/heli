// Load-more endpoint for the /people list page.
//
// Only valid for the default unfiltered, sort=recent view — the page-level
// server load enforces that nextCursor is only emitted when those conditions
// hold. We mirror the constraint here: cursor is the only knob; archived,
// favorite, q, tag, priority, status are intentionally not accepted.

import { error, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  PERSON_ROW_COLS,
  personLastInteractionJoin,
  type PersonRow
} from '$lib/server/people-rows';
import { decodeCursor, encodeCursor } from '$lib/server/cursor';
import { jsonWithEtag } from '$lib/server/cache';

const PAGE_SIZE = 50;

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const d = db(locals.user.region);
  const userId = locals.user.id;
  const LAST_INTERACTION_JOIN = personLastInteractionJoin(userId);

  const cursorClause = cursor
    ? sql`AND (p.created_at, p.id) < (${cursor.createdAt}, ${cursor.id})`
    : sql``;

  const rows = await d.all<PersonRow>(sql`
    SELECT ${PERSON_ROW_COLS}
    FROM people p
    LEFT JOIN companies co ON co.id = p.company_id
    ${LAST_INTERACTION_JOIN}
    WHERE p.user_id = ${userId}
      AND p.is_archived = 0
      ${cursorClause}
    ORDER BY p.created_at DESC, p.id DESC
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
