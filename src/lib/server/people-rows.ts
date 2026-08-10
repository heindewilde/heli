// Shared row shape + SQL fragments for the /people list view. Used by both
// the page-level server load (which adds filter/sort/tag handling on top)
// and the dedicated /api/people/list endpoint that powers Load More.

import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import type { Scope } from './scope';

export type PersonRow = {
  id: string;
  name: string;
  role: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companyFaviconUrl: string | null;
  companyLogoUrl: string | null;
  url: string | null;
  domain: string | null;
  email: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  priority: number | null;
  statusId: string | null;
  isFavorite: number;
  isArchived: number;
  source: string | null;
  createdAt: number;
  updatedAt: number;
  lastAt: number | null;
};

export const PERSON_ROW_COLS: SQL = sql`
  p.id, p.name, p.role, p.company_id AS companyId,
  co.name AS companyName, co.domain AS companyDomain,
  co.favicon_url AS companyFaviconUrl, co.logo_url AS companyLogoUrl,
  p.url, p.domain, p.email,
  p.avatar_url AS avatarUrl, p.favicon_url AS faviconUrl,
  p.priority, p.status_id AS statusId,
  p.is_favorite AS isFavorite, p.is_archived AS isArchived,
  p.source, p.created_at AS createdAt, p.updated_at AS updatedAt,
  li.last_at AS lastAt
`;

/**
 * One row, in exactly the shape the list pages render.
 *
 * This is what lets a create return the finished row instead of the client
 * calling `invalidateAll()` and paying a whole SSR reload — eight more database
 * round trips, which on the cloud's remote libSQL is the difference between
 * instant and not. Because it goes through PERSON_ROW_COLS, the shape cannot
 * drift from the list query.
 */
export async function fetchPersonRow(s: Scope, id: string): Promise<PersonRow | null> {
  const rows = await db(s.region).all<PersonRow>(sql`
    SELECT ${PERSON_ROW_COLS}
    FROM people p
    LEFT JOIN companies co ON co.id = p.company_id
    ${personLastInteractionJoin(s.workspaceId)}
    WHERE p.workspace_id = ${s.workspaceId} AND p.id = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export function personLastInteractionJoin(workspaceId: string): SQL {
  return sql`
    LEFT JOIN (
      SELECT ip.person_id AS pid, MAX(i.occurred_at) AS last_at
      FROM interaction_people ip
      JOIN interactions i ON i.id = ip.interaction_id AND i.workspace_id = ${workspaceId}
      GROUP BY ip.person_id
    ) li ON li.pid = p.id
  `;
}
