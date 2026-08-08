import { requireScope } from '$lib/server/scope';
import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies, people } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { projectsForCompany } from '$lib/server/projects-query';
import { getTagsForEntity } from '$lib/server/tags';
import { listCollectionsForEntity } from '$lib/server/collections';
import { listPipelinesForEntity } from '$lib/server/pipelines';
import { listTasksForEntity } from '$lib/server/tasks';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  const company = await d
    .select()
    .from(companies)
    .where(and(eq(companies.id, params.id), eq(companies.workspaceId, s.workspaceId)))
    .get();
  if (!company) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved = url.searchParams.get('just') === '1' && Date.now() - company.createdAt < FRESH_GRACE_MS;
  const dedup = url.searchParams.get('dedup') === '1';

  const linkedPeople = await d
    .select({
      id: people.id,
      name: people.name,
      role: people.role,
      avatarUrl: people.avatarUrl,
      isFavorite: people.isFavorite,
      isArchived: people.isArchived
    })
    .from(people)
    .where(and(eq(people.companyId, company.id), eq(people.workspaceId, s.workspaceId), eq(people.isArchived, 0)))
    .orderBy(desc(people.updatedAt))
    .limit(50);

  const interactions = await listInteractions(s, {
    companyId: company.id,
    limit: 50
  });

  const tags = await getTagsForEntity(s, 'company', company.id);

  const projects = await projectsForCompany(s, company.id);

  const [collections, pipelines, tasks] = await Promise.all([
    listCollectionsForEntity(s, 'company', company.id),
    listPipelinesForEntity(s, 'company', company.id),
    listTasksForEntity(s, 'company', company.id)
  ]);

  return {
    company,
    linkedPeople,
    interactions,
    tags,
    justSaved,
    dedup,
    projects,
    collections,
    pipelines,
    tasks
  };
};
