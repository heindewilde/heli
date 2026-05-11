import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
  projects,
  projectLinks,
  projectPeople,
  projectCompanies,
  interactionProjects,
  people,
  companies,
  interactions,
  type Project,
  type ProjectStatus
} from './schema';
import { ftsQuery } from './search';
import { getTagsForEntity, getTagsForEntities } from './tags';

export type ProjectListRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: number | null;
  endDate: number | null;
  billingType: string;
  hourlyRate: number | null;
  fixedFee: number | null;
  currency: string | null;
  nextStep: string | null;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  lastInteractionAt: number | null;
};

export type ListFilters = {
  q?: string;
  status?: ProjectStatus | 'all';
  personId?: string;
  companyId?: string;
  tagFilterIds?: string[] | null;
  sort?: 'recent' | 'updated' | 'name' | 'endDate' | 'lastInteraction';
  limit?: number;
};

export async function listProjects(
  userId: string,
  region: string,
  filters: ListFilters = {}
): Promise<ProjectListRow[]> {
  const d = db(region);
  const limit = Math.min(filters.limit ?? 200, 500);
  const fts = filters.q ? ftsQuery(filters.q) : null;

  // Status: default 'active' unless caller explicitly asks otherwise.
  const status = filters.status ?? 'active';
  const statusClause = status === 'all' ? sql`` : sql`AND p.status = ${status}`;
  const personClause = filters.personId
    ? sql`AND EXISTS (SELECT 1 FROM project_people pp WHERE pp.project_id = p.id AND pp.person_id = ${filters.personId})`
    : sql``;
  const companyClause = filters.companyId
    ? sql`AND EXISTS (SELECT 1 FROM project_companies pc WHERE pc.project_id = p.id AND pc.company_id = ${filters.companyId})`
    : sql``;
  const tagFilter =
    filters.tagFilterIds && filters.tagFilterIds.length > 0
      ? sql`AND p.id IN (${sql.join(
          filters.tagFilterIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;
  const ftsClause = fts
    ? sql`AND p.id IN (
        SELECT pp.id FROM projects pp
        JOIN projects_fts f ON f.rowid = pp.rowid
        WHERE pp.user_id = ${userId} AND f.projects_fts MATCH ${fts}
      )`
    : sql``;

  const sort = filters.sort ?? (fts ? 'relevance' : 'updated');
  let orderClause;
  if (fts && sort === 'relevance') {
    // FTS path needs its own SELECT to get the rank; for simplicity here we
    // fall back to updated when both filters and sort are active.
    orderClause = sql`ORDER BY p.updated_at DESC`;
  } else if (sort === 'name') {
    orderClause = sql`ORDER BY p.name ASC`;
  } else if (sort === 'endDate') {
    orderClause = sql`ORDER BY (p.end_date IS NULL), p.end_date ASC, p.updated_at DESC`;
  } else if (sort === 'recent') {
    orderClause = sql`ORDER BY p.created_at DESC`;
  } else if (sort === 'lastInteraction') {
    orderClause = sql`ORDER BY (lastInteractionAt IS NULL), lastInteractionAt DESC, p.updated_at DESC`;
  } else {
    orderClause = sql`ORDER BY p.updated_at DESC`;
  }

  const rows = await d.all<ProjectListRow>(sql`
    SELECT
      p.id, p.name, p.description, p.status,
      p.start_date AS startDate, p.end_date AS endDate,
      p.billing_type AS billingType, p.hourly_rate AS hourlyRate,
      p.fixed_fee AS fixedFee, p.currency, p.next_step AS nextStep,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM project_people WHERE project_id = p.id)
        + (SELECT COUNT(*) FROM project_companies WHERE project_id = p.id) AS memberCount,
      (SELECT MAX(i.occurred_at)
         FROM interaction_projects ip
         JOIN interactions i ON i.id = ip.interaction_id
        WHERE ip.project_id = p.id AND i.user_id = ${userId}) AS lastInteractionAt
    FROM projects p
    WHERE p.user_id = ${userId}
      ${statusClause}
      ${personClause}
      ${companyClause}
      ${tagFilter}
      ${ftsClause}
    ${orderClause}
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    ...r,
    status: r.status as ProjectStatus,
    memberCount: Number(r.memberCount ?? 0),
    lastInteractionAt: r.lastInteractionAt == null ? null : Number(r.lastInteractionAt)
  }));
}

export type ProjectMember = { id: string; name: string; avatarUrl?: string | null; logoUrl?: string | null; faviconUrl?: string | null; domain?: string | null };
export type ProjectLinkRow = { id: string; url: string; label: string | null; createdAt: number };
export type ProjectInteractionRow = {
  id: string;
  occurredAt: number;
  type: string;
  title: string;
};

export type ProjectDetail = Project & {
  links: ProjectLinkRow[];
  people: ProjectMember[];
  companies: ProjectMember[];
  interactions: ProjectInteractionRow[];
  tags: { id: string; name: string; slug: string }[];
};

export async function getProject(
  userId: string,
  region: string,
  id: string
): Promise<ProjectDetail | null> {
  const d = db(region);
  const project = await d
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();
  if (!project) return null;

  const [links, peopleRows, companyRows, interactionRows, tagList] = await Promise.all([
    d
      .select({
        id: projectLinks.id,
        url: projectLinks.url,
        label: projectLinks.label,
        createdAt: projectLinks.createdAt
      })
      .from(projectLinks)
      .where(eq(projectLinks.projectId, id))
      .orderBy(asc(projectLinks.createdAt)),
    d
      .select({
        id: people.id,
        name: people.name,
        avatarUrl: people.avatarUrl
      })
      .from(projectPeople)
      .innerJoin(people, eq(people.id, projectPeople.personId))
      .where(and(eq(projectPeople.projectId, id), eq(people.userId, userId)))
      .orderBy(asc(people.name)),
    d
      .select({
        id: companies.id,
        name: companies.name,
        logoUrl: companies.logoUrl,
        faviconUrl: companies.faviconUrl,
        domain: companies.domain
      })
      .from(projectCompanies)
      .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
      .where(and(eq(projectCompanies.projectId, id), eq(companies.userId, userId)))
      .orderBy(asc(companies.name)),
    d
      .select({
        id: interactions.id,
        occurredAt: interactions.occurredAt,
        type: interactions.type,
        title: interactions.title
      })
      .from(interactionProjects)
      .innerJoin(interactions, eq(interactions.id, interactionProjects.interactionId))
      .where(and(eq(interactionProjects.projectId, id), eq(interactions.userId, userId)))
      .orderBy(desc(interactions.occurredAt)),
    getTagsForEntity(userId, region, 'project', id)
  ]);

  return { ...project, links, people: peopleRows, companies: companyRows, interactions: interactionRows, tags: tagList };
}

/** Active projects where this person is a member. */
export async function projectsForPerson(
  userId: string,
  region: string,
  personId: string,
  status: ProjectStatus | 'all' = 'active'
): Promise<ProjectListRow[]> {
  return listProjects(userId, region, { personId, status, sort: 'updated', limit: 50 });
}

/** Active projects where this company is a member. */
export async function projectsForCompany(
  userId: string,
  region: string,
  companyId: string,
  status: ProjectStatus | 'all' = 'active'
): Promise<ProjectListRow[]> {
  return listProjects(userId, region, { companyId, status, sort: 'updated', limit: 50 });
}

/**
 * Active projects where BOTH the person AND the company are members. Used
 * by the "Together at {Company}" subsection on /people/[id].
 */
export async function projectsTogether(
  userId: string,
  region: string,
  personId: string,
  companyId: string
): Promise<ProjectListRow[]> {
  return listProjects(userId, region, {
    personId,
    companyId,
    status: 'active',
    sort: 'updated',
    limit: 20
  });
}

/**
 * Active projects matching ANY of the listed people OR the company. Used
 * by /interactions/new to pre-fill the project picker. The optional
 * `exclude` set lets the client request fresh suggestions without re-
 * suggesting projects the user already pinned.
 */
export async function suggestProjectsFor(
  userId: string,
  region: string,
  args: { personIds?: string[]; companyId?: string | null; exclude?: string[] }
): Promise<{ id: string; name: string; status: ProjectStatus }[]> {
  const personIds = args.personIds ?? [];
  if (personIds.length === 0 && !args.companyId) return [];
  const d = db(region);
  const exclude = args.exclude ?? [];
  const excludeClause =
    exclude.length > 0
      ? sql`AND p.id NOT IN (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

  const matchClauses: ReturnType<typeof sql>[] = [];
  if (personIds.length > 0) {
    matchClauses.push(sql`
      EXISTS (
        SELECT 1 FROM project_people pp
        WHERE pp.project_id = p.id
          AND pp.person_id IN (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})
      )`);
  }
  if (args.companyId) {
    matchClauses.push(sql`
      EXISTS (
        SELECT 1 FROM project_companies pc
        WHERE pc.project_id = p.id AND pc.company_id = ${args.companyId}
      )`);
  }
  const matchAny = sql.join(matchClauses, sql` OR `);

  const rows = await d.all<{ id: string; name: string; status: string }>(sql`
    SELECT p.id, p.name, p.status
    FROM projects p
    WHERE p.user_id = ${userId}
      AND p.status = 'active'
      AND (${matchAny})
      ${excludeClause}
    ORDER BY p.updated_at DESC
    LIMIT 10
  `);
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status as ProjectStatus }));
}

/**
 * Group projects by interaction id. Used to render project chips on
 * interaction list/detail pages without an N+1 lookup.
 */
export async function projectsForInteractions(
  userId: string,
  region: string,
  interactionIds: string[]
): Promise<Map<string, { id: string; name: string; status: ProjectStatus }[]>> {
  const out = new Map<string, { id: string; name: string; status: ProjectStatus }[]>();
  if (interactionIds.length === 0) return out;
  const d = db(region);
  const rows = await d
    .select({
      interactionId: interactionProjects.interactionId,
      id: projects.id,
      name: projects.name,
      status: projects.status
    })
    .from(interactionProjects)
    .innerJoin(projects, eq(projects.id, interactionProjects.projectId))
    .where(and(eq(projects.userId, userId), inArray(interactionProjects.interactionId, interactionIds)));
  for (const r of rows) {
    const list = out.get(r.interactionId) ?? [];
    list.push({ id: r.id, name: r.name, status: r.status as ProjectStatus });
    out.set(r.interactionId, list);
  }
  return out;
}

/**
 * Lightweight typeahead for ProjectPicker. Used by /api/projects?q=&limit=.
 */
export async function searchProjects(
  userId: string,
  region: string,
  q: string,
  limit = 8
): Promise<{ id: string; name: string; status: ProjectStatus }[]> {
  const d = db(region);
  const fts = ftsQuery(q);
  if (!fts) {
    const rows = await d
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, status: r.status as ProjectStatus }));
  }
  const rows = await d.all<{ id: string; name: string; status: string }>(sql`
    SELECT p.id, p.name, p.status
    FROM projects p
    JOIN projects_fts f ON f.rowid = p.rowid
    WHERE p.user_id = ${userId}
      AND f.projects_fts MATCH ${fts}
    ORDER BY rank
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status as ProjectStatus }));
}

export type ProjectCompany = { id: string; name: string; domain: string | null; logoUrl: string | null; faviconUrl: string | null };

/** Returns a map of projectId → companies for a batch of project ids. */
export async function getCompaniesForProjects(
  userId: string,
  region: string,
  projectIds: string[]
): Promise<Map<string, ProjectCompany[]>> {
  const out = new Map<string, ProjectCompany[]>();
  if (projectIds.length === 0) return out;
  const d = db(region);
  const rows = await d
    .select({
      projectId: projectCompanies.projectId,
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      logoUrl: companies.logoUrl,
      faviconUrl: companies.faviconUrl
    })
    .from(projectCompanies)
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(and(eq(companies.userId, userId), inArray(projectCompanies.projectId, projectIds)));
  for (const r of rows) {
    const list = out.get(r.projectId) ?? [];
    list.push({ id: r.id, name: r.name, domain: r.domain, logoUrl: r.logoUrl, faviconUrl: r.faviconUrl });
    out.set(r.projectId, list);
  }
  return out;
}

// Deprecated alias for symmetry with previous naming; kept for tag joins.
export { getTagsForEntities };
