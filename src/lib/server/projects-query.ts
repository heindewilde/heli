import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
  projects,
  projectLinks,
  projectPeople,
  projectCompanies,
  projectMilestones,
  projectGoals,
  interactionProjects,
  people,
  companies,
  interactions,
  type Project,
  type ProjectStatus,
  type ProjectType,
  type ProjectMilestone,
  type ProjectGoal
} from './schema';
import { ftsQuery } from './search';
import type { Scope } from './scope';

export type ProjectListRow = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType | null;
  startDate: number | null;
  endDate: number | null;
  billingType: string;
  hourlyRate: number | null;
  fixedFee: number | null;
  monthlyFee: number | null;
  currency: string | null;
  nextStep: string | null;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  lastInteractionAt: number | null;
};

export type ListFilters = {
  q?: string;
  status?: ProjectStatus | 'all';
  projectType?: ProjectType | 'all';
  personId?: string;
  companyId?: string;
  sort?: 'recent' | 'updated' | 'name' | 'endDate' | 'lastInteraction';
  limit?: number;
};

/**
 * The WHERE clauses shared by `listProjects` and `countProjects`.
 *
 * Extracted so the two cannot drift: the list page renders one and counts with
 * the other, and a filter honoured by only one of them shows "50 of 12".
 */
function filterClauses(s: Scope, filters: ListFilters) {
  const fts = filters.q ? ftsQuery(filters.q) : null;
  // Status: default 'active' unless caller explicitly asks otherwise.
  const status = filters.status ?? 'active';
  const type = filters.projectType ?? 'all';
  return {
    fts,
    statusClause: status === 'all' ? sql`` : sql`AND p.status = ${status}`,
    typeClause: type === 'all' ? sql`` : sql`AND p.project_type = ${type}`,
    personClause: filters.personId
      ? sql`AND EXISTS (SELECT 1 FROM project_people pp WHERE pp.project_id = p.id AND pp.person_id = ${filters.personId})`
      : sql``,
    companyClause: filters.companyId
      ? sql`AND EXISTS (SELECT 1 FROM project_companies pc WHERE pc.project_id = p.id AND pc.company_id = ${filters.companyId})`
      : sql``,
    ftsClause: fts
      ? sql`AND p.id IN (
          SELECT pp.id FROM projects pp
          JOIN projects_fts f ON f.rowid = pp.rowid
          WHERE pp.workspace_id = ${s.workspaceId} AND f.projects_fts MATCH ${fts}
        )`
      : sql``
  };
}

/**
 * How many projects match these filters, ignoring the limit.
 *
 * The list page used to answer this by running `listProjects({limit: 500})` a
 * second time — a full second scan, with all the correlated member-count and
 * last-interaction subqueries, to read `.length`.
 */
export async function countProjects(s: Scope, filters: ListFilters = {}): Promise<number> {
  const { statusClause, typeClause, personClause, companyClause, ftsClause } = filterClauses(
    s,
    filters
  );
  const row = await db(s.region).get<{ n: number }>(sql`
    SELECT COUNT(*) AS n
    FROM projects p
    WHERE p.workspace_id = ${s.workspaceId}
      ${statusClause}
      ${typeClause}
      ${personClause}
      ${companyClause}
      ${ftsClause}
  `);
  return Number(row?.n ?? 0);
}

export async function listProjects(
  s: Scope,
  filters: ListFilters = {}
): Promise<ProjectListRow[]> {
  const d = db(s.region);
  const limit = Math.min(filters.limit ?? 200, 500);
  const { fts, statusClause, typeClause, personClause, companyClause, ftsClause } = filterClauses(
    s,
    filters
  );

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
      p.id, p.name, p.description, p.status, p.project_type AS projectType,
      p.start_date AS startDate, p.end_date AS endDate,
      p.billing_type AS billingType, p.hourly_rate AS hourlyRate,
      p.fixed_fee AS fixedFee, p.monthly_fee AS monthlyFee,
      p.currency, p.next_step AS nextStep, p.icon,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM project_people WHERE project_id = p.id)
        + (SELECT COUNT(*) FROM project_companies WHERE project_id = p.id) AS memberCount,
      (SELECT MAX(i.occurred_at)
         FROM interaction_projects ip
         JOIN interactions i ON i.id = ip.interaction_id
        WHERE ip.project_id = p.id AND i.workspace_id = ${s.workspaceId}) AS lastInteractionAt
    FROM projects p
    WHERE p.workspace_id = ${s.workspaceId}
      ${statusClause}
      ${typeClause}
      ${personClause}
      ${companyClause}
      ${ftsClause}
    ${orderClause}
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    ...r,
    status: r.status as ProjectStatus,
    projectType: (r.projectType ?? null) as ProjectType | null,
    memberCount: Number(r.memberCount ?? 0),
    lastInteractionAt: r.lastInteractionAt == null ? null : Number(r.lastInteractionAt)
  }));
}

export type ProjectMember = { id: string; name: string; avatarUrl?: string | null; logoUrl?: string | null; faviconUrl?: string | null; domain?: string | null };
export type ProjectLinkRow = {
  id: string;
  url: string;
  label: string | null;
  kind: string | null;
  position: number | null;
  createdAt: number;
};
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
  milestones: ProjectMilestone[];
  goals: ProjectGoal[];
};

/**
 * The detail page renders at most this many interactions.
 *
 * It used to fetch every interaction ever linked to a project with no limit at
 * all — fine on a week-old workspace, a slow unbounded payload on a two-year
 * client engagement.
 */
export const PROJECT_INTERACTIONS_LIMIT = 100;

/**
 * Just the project row. This is the only thing `/projects/[id]` awaits — the
 * six lists below are returned to the page as unawaited promises so the name
 * and status ship in the first bytes of HTML.
 */
export async function getProjectHeader(s: Scope, id: string): Promise<Project | null> {
  const row = await db(s.region)
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, s.workspaceId)))
    .get();
  return row ?? null;
}

/**
 * Links, newest ordering last.
 *
 * Rows created before `position` existed have it NULL; `position IS NULL`
 * sorts them after the ordered ones rather than ahead of everything, and
 * createdAt breaks the tie among them.
 */
export function getProjectLinks(s: Scope, id: string): Promise<ProjectLinkRow[]> {
  return db(s.region)
    .select({
      id: projectLinks.id,
      url: projectLinks.url,
      label: projectLinks.label,
      kind: projectLinks.kind,
      position: projectLinks.position,
      createdAt: projectLinks.createdAt
    })
    .from(projectLinks)
    .where(eq(projectLinks.projectId, id))
    .orderBy(
      sql`${projectLinks.position} IS NULL`,
      asc(projectLinks.position),
      asc(projectLinks.createdAt)
    );
}

export function getProjectPeople(s: Scope, id: string): Promise<ProjectMember[]> {
  return db(s.region)
    .select({ id: people.id, name: people.name, avatarUrl: people.avatarUrl })
    .from(projectPeople)
    .innerJoin(people, eq(people.id, projectPeople.personId))
    .where(and(eq(projectPeople.projectId, id), eq(people.workspaceId, s.workspaceId)))
    .orderBy(asc(people.name));
}

export function getProjectCompanies(s: Scope, id: string): Promise<ProjectMember[]> {
  return db(s.region)
    .select({
      id: companies.id,
      name: companies.name,
      logoUrl: companies.logoUrl,
      faviconUrl: companies.faviconUrl,
      domain: companies.domain
    })
    .from(projectCompanies)
    .innerJoin(companies, eq(companies.id, projectCompanies.companyId))
    .where(and(eq(projectCompanies.projectId, id), eq(companies.workspaceId, s.workspaceId)))
    .orderBy(asc(companies.name));
}

export function getProjectInteractions(
  s: Scope,
  id: string,
  limit = PROJECT_INTERACTIONS_LIMIT
): Promise<ProjectInteractionRow[]> {
  return db(s.region)
    .select({
      id: interactions.id,
      occurredAt: interactions.occurredAt,
      type: interactions.type,
      title: interactions.title
    })
    .from(interactionProjects)
    .innerJoin(interactions, eq(interactions.id, interactionProjects.interactionId))
    .where(and(eq(interactionProjects.projectId, id), eq(interactions.workspaceId, s.workspaceId)))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);
}

/**
 * Milestones and goals read directly here rather than through
 * `project-plan.ts`, whose exports re-verify the project with an extra query.
 * By this point the caller already holds the project row, which *is* the
 * workspace check.
 */
export function getProjectMilestones(s: Scope, id: string): Promise<ProjectMilestone[]> {
  return db(s.region)
    .select()
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, id))
    .orderBy(asc(projectMilestones.position), asc(projectMilestones.createdAt));
}

export function getProjectGoals(s: Scope, id: string): Promise<ProjectGoal[]> {
  return db(s.region)
    .select()
    .from(projectGoals)
    .where(eq(projectGoals.projectId, id))
    .orderBy(asc(projectGoals.position), asc(projectGoals.createdAt));
}

/**
 * The whole entity in one object. Used by the API (`GET`/`PATCH` return the
 * fresh entity); the page load composes the parts above instead so it can
 * stream them.
 */
export async function getProject(
  s: Scope,
  id: string
): Promise<ProjectDetail | null> {
  const project = await getProjectHeader(s, id);
  if (!project) return null;

  const [links, peopleRows, companyRows, interactionRows, milestones, goals] = await Promise.all([
    getProjectLinks(s, id),
    getProjectPeople(s, id),
    getProjectCompanies(s, id),
    getProjectInteractions(s, id),
    getProjectMilestones(s, id),
    getProjectGoals(s, id)
  ]);

  return {
    ...project,
    links,
    people: peopleRows,
    companies: companyRows,
    interactions: interactionRows,
    milestones,
    goals
  };
}

/** Active projects where this person is a member. */
export async function projectsForPerson(
  s: Scope,
  personId: string,
  status: ProjectStatus | 'all' = 'active'
): Promise<ProjectListRow[]> {
  return listProjects(s, { personId, status, sort: 'updated', limit: 50 });
}

/** Active projects where this company is a member. */
export async function projectsForCompany(
  s: Scope,
  companyId: string,
  status: ProjectStatus | 'all' = 'active'
): Promise<ProjectListRow[]> {
  return listProjects(s, { companyId, status, sort: 'updated', limit: 50 });
}

/**
 * Active projects where BOTH the person AND the company are members. Used
 * by the "Together at {Company}" subsection on /people/[id].
 */
export async function projectsTogether(
  s: Scope,
  personId: string,
  companyId: string
): Promise<ProjectListRow[]> {
  return listProjects(s, {
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
  s: Scope,
  args: { personIds?: string[]; companyId?: string | null; exclude?: string[] }
): Promise<{ id: string; name: string; status: ProjectStatus }[]> {
  const personIds = args.personIds ?? [];
  if (personIds.length === 0 && !args.companyId) return [];
  const d = db(s.region);
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
    WHERE p.workspace_id = ${s.workspaceId}
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
  s: Scope,
  interactionIds: string[]
): Promise<Map<string, { id: string; name: string; status: ProjectStatus }[]>> {
  const out = new Map<string, { id: string; name: string; status: ProjectStatus }[]>();
  if (interactionIds.length === 0) return out;
  const d = db(s.region);
  const rows = await d
    .select({
      interactionId: interactionProjects.interactionId,
      id: projects.id,
      name: projects.name,
      status: projects.status
    })
    .from(interactionProjects)
    .innerJoin(projects, eq(projects.id, interactionProjects.projectId))
    .where(and(eq(projects.workspaceId, s.workspaceId), inArray(interactionProjects.interactionId, interactionIds)));
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
  s: Scope,
  q: string,
  limit = 8
): Promise<{ id: string; name: string; status: ProjectStatus }[]> {
  const d = db(s.region);
  const fts = ftsQuery(q);
  if (!fts) {
    const rows = await d
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.workspaceId, s.workspaceId))
      .orderBy(desc(projects.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, status: r.status as ProjectStatus }));
  }
  const rows = await d.all<{ id: string; name: string; status: string }>(sql`
    SELECT p.id, p.name, p.status
    FROM projects p
    JOIN projects_fts f ON f.rowid = p.rowid
    WHERE p.workspace_id = ${s.workspaceId}
      AND f.projects_fts MATCH ${fts}
    ORDER BY rank
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status as ProjectStatus }));
}

export type ProjectCompany = { id: string; name: string; domain: string | null; logoUrl: string | null; faviconUrl: string | null };

/** Returns a map of projectId → companies for a batch of project ids. */
export async function getCompaniesForProjects(
  s: Scope,
  projectIds: string[]
): Promise<Map<string, ProjectCompany[]>> {
  const out = new Map<string, ProjectCompany[]>();
  if (projectIds.length === 0) return out;
  const d = db(s.region);
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
    .where(and(eq(companies.workspaceId, s.workspaceId), inArray(projectCompanies.projectId, projectIds)));
  for (const r of rows) {
    const list = out.get(r.projectId) ?? [];
    list.push({ id: r.id, name: r.name, domain: r.domain, logoUrl: r.logoUrl, faviconUrl: r.faviconUrl });
    out.set(r.projectId, list);
  }
  return out;
}

