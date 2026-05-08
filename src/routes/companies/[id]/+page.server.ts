import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies, people } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { projectsForCompany } from '$lib/server/projects-query';
import { getTagsForEntity } from '$lib/server/tags';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const d = db(locals.user.region);
  const company = await d
    .select()
    .from(companies)
    .where(and(eq(companies.id, params.id), eq(companies.userId, locals.user.id)))
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
    .where(and(eq(people.companyId, company.id), eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
    .orderBy(desc(people.updatedAt))
    .limit(50);

  const interactions = await listInteractions(locals.user.id, locals.user.region, {
    companyId: company.id,
    limit: 50
  });

  const tags = await getTagsForEntity(locals.user.id, locals.user.region, 'company', company.id);

  const projects = await projectsForCompany(locals.user.id, locals.user.region, company.id);

  return { company, linkedPeople, interactions, tags, justSaved, dedup, projects };
};
