// Shared row shape + SQL fragments for the /people list view. Used by both
// the page-level server load (which adds filter/sort/tag handling on top)
// and the dedicated /api/people/list endpoint that powers Load More.

import { sql, type SQL } from 'drizzle-orm';

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

export function personLastInteractionJoin(userId: string): SQL {
  return sql`
    LEFT JOIN (
      SELECT ip.person_id AS pid, MAX(i.occurred_at) AS last_at
      FROM interaction_people ip
      JOIN interactions i ON i.id = ip.interaction_id AND i.user_id = ${userId}
      GROUP BY ip.person_id
    ) li ON li.pid = p.id
  `;
}
