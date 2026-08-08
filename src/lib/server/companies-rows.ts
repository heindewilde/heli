// Shared row shape + SQL fragments for the /companies list view. Used by both
// the page-level server load and the dedicated /api/companies/list endpoint
// that powers Load More.

import { sql, type SQL } from 'drizzle-orm';

export type CompanyRow = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  domain: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  industry: string | null;
  sizeBand: string | null;
  location: string | null;
  priority: number | null;
  statusId: string | null;
  isFavorite: number;
  isArchived: number;
  source: string | null;
  createdAt: number;
  updatedAt: number;
  lastAt: number | null;
};

export const COMPANY_ROW_COLS: SQL = sql`
  c.id, c.name, c.description, c.url, c.domain,
  c.logo_url AS logoUrl, c.favicon_url AS faviconUrl,
  c.industry, c.size_band AS sizeBand, c.location,
  c.priority, c.status_id AS statusId,
  c.is_favorite AS isFavorite, c.is_archived AS isArchived,
  c.source, c.created_at AS createdAt, c.updated_at AS updatedAt,
  li.last_at AS lastAt
`;

// Companies link directly to interactions via i.company_id (no junction
// table on this side), unlike people.
export function companyLastInteractionJoin(workspaceId: string): SQL {
  return sql`
    LEFT JOIN (
      SELECT i.company_id AS cid, MAX(i.occurred_at) AS last_at
      FROM interactions i
      WHERE i.workspace_id = ${workspaceId}
      GROUP BY i.company_id
    ) li ON li.cid = c.id
  `;
}
