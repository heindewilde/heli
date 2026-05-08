import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from './db';
import { interactions, interactionPeople, interactionProjects, people, companies, projects } from './schema';
import { ftsQuery } from './search';
import type { ProjectStatus } from './schema';

export type InteractionRow = {
  id: string;
  occurredAt: number;
  type: string;
  title: string;
  body: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: number;
  updatedAt: number;
  people: { id: string; name: string; avatarUrl: string | null }[];
  projects: { id: string; name: string; status: ProjectStatus }[];
};

export type ListFilters = {
  q?: string;
  personId?: string;
  companyId?: string;
  type?: string;
  from?: number;
  to?: number;
  limit?: number;
};

export async function listInteractions(
  userId: string,
  region: string,
  filters: ListFilters = {}
): Promise<InteractionRow[]> {
  const d = db(region);
  const limit = Math.min(filters.limit ?? 200, 500);

  let ids: string[] | null = null;
  if (filters.q) {
    const fq = ftsQuery(filters.q);
    if (fq) {
      const rows = await d.all<{ id: string }>(sql`
        SELECT i.id
        FROM interactions i
        JOIN interactions_fts f ON f.rowid = i.rowid
        WHERE i.user_id = ${userId}
          AND f.interactions_fts MATCH ${fq}
        ORDER BY rank
        LIMIT ${limit}
      `);
      ids = rows.map((r) => r.id);
      if (ids.length === 0) return [];
    }
  }

  if (filters.personId) {
    const rows = await d
      .select({ interactionId: interactionPeople.interactionId })
      .from(interactionPeople)
      .where(eq(interactionPeople.personId, filters.personId));
    const personIds = rows.map((r) => r.interactionId);
    ids = ids ? ids.filter((id) => personIds.includes(id)) : personIds;
    if (ids.length === 0) return [];
  }

  const where = [eq(interactions.userId, userId)];
  if (ids) where.push(inArray(interactions.id, ids));
  if (filters.companyId) where.push(eq(interactions.companyId, filters.companyId));
  if (filters.type) where.push(eq(interactions.type, filters.type));
  if (filters.from !== undefined) where.push(gte(interactions.occurredAt, filters.from));
  if (filters.to !== undefined) where.push(lte(interactions.occurredAt, filters.to));

  const items = await d
    .select({
      id: interactions.id,
      occurredAt: interactions.occurredAt,
      type: interactions.type,
      title: interactions.title,
      body: interactions.body,
      companyId: interactions.companyId,
      companyName: companies.name,
      createdAt: interactions.createdAt,
      updatedAt: interactions.updatedAt
    })
    .from(interactions)
    .leftJoin(companies, eq(companies.id, interactions.companyId))
    .where(and(...where))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);

  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.id);
  const [links, projectLinks] = await Promise.all([
    d
      .select({
        interactionId: interactionPeople.interactionId,
        personId: people.id,
        name: people.name,
        avatarUrl: people.avatarUrl
      })
      .from(interactionPeople)
      .innerJoin(people, eq(people.id, interactionPeople.personId))
      .where(inArray(interactionPeople.interactionId, itemIds)),
    d
      .select({
        interactionId: interactionProjects.interactionId,
        id: projects.id,
        name: projects.name,
        status: projects.status
      })
      .from(interactionProjects)
      .innerJoin(projects, eq(projects.id, interactionProjects.projectId))
      .where(and(eq(projects.userId, userId), inArray(interactionProjects.interactionId, itemIds)))
  ]);

  const byInteraction = new Map<string, InteractionRow['people']>();
  for (const l of links) {
    const list = byInteraction.get(l.interactionId) ?? [];
    list.push({ id: l.personId, name: l.name, avatarUrl: l.avatarUrl });
    byInteraction.set(l.interactionId, list);
  }
  const projectsByInteraction = new Map<string, InteractionRow['projects']>();
  for (const l of projectLinks) {
    const list = projectsByInteraction.get(l.interactionId) ?? [];
    list.push({ id: l.id, name: l.name, status: l.status as ProjectStatus });
    projectsByInteraction.set(l.interactionId, list);
  }

  return items.map((i) => ({
    ...i,
    people: byInteraction.get(i.id) ?? [],
    projects: projectsByInteraction.get(i.id) ?? []
  }));
}

export async function getInteraction(
  userId: string,
  region: string,
  id: string
): Promise<InteractionRow | null> {
  const d = db(region);
  const item = await d
    .select({
      id: interactions.id,
      occurredAt: interactions.occurredAt,
      type: interactions.type,
      title: interactions.title,
      body: interactions.body,
      companyId: interactions.companyId,
      companyName: companies.name,
      createdAt: interactions.createdAt,
      updatedAt: interactions.updatedAt
    })
    .from(interactions)
    .leftJoin(companies, eq(companies.id, interactions.companyId))
    .where(and(eq(interactions.id, id), eq(interactions.userId, userId)))
    .get();
  if (!item) return null;
  const [links, projLinks] = await Promise.all([
    d
      .select({
        personId: people.id,
        name: people.name,
        avatarUrl: people.avatarUrl
      })
      .from(interactionPeople)
      .innerJoin(people, eq(people.id, interactionPeople.personId))
      .where(eq(interactionPeople.interactionId, id)),
    d
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status
      })
      .from(interactionProjects)
      .innerJoin(projects, eq(projects.id, interactionProjects.projectId))
      .where(and(eq(projects.userId, userId), eq(interactionProjects.interactionId, id)))
  ]);
  return {
    ...item,
    people: links.map((l) => ({ id: l.personId, name: l.name, avatarUrl: l.avatarUrl })),
    projects: projLinks.map((l) => ({ id: l.id, name: l.name, status: l.status as ProjectStatus }))
  };
}
