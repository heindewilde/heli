import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies, projects } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const d = db(locals.user.region);
  const presetPersonId = url.searchParams.get('person');
  const presetCompanyId = url.searchParams.get('company');
  const presetProjectId = url.searchParams.get('project');

  const [presetPerson, presetCompany, presetProject] = await Promise.all([
    presetPersonId
      ? d
          .select({
            id: people.id,
            name: people.name,
            avatarUrl: people.avatarUrl,
            role: people.role
          })
          .from(people)
          .where(and(eq(people.id, presetPersonId), eq(people.userId, locals.user.id)))
          .get()
      : null,
    presetCompanyId
      ? d
          .select({
            id: companies.id,
            name: companies.name,
            logoUrl: companies.logoUrl,
            faviconUrl: companies.faviconUrl,
            domain: companies.domain
          })
          .from(companies)
          .where(and(eq(companies.id, presetCompanyId), eq(companies.userId, locals.user.id)))
          .get()
      : null,
    presetProjectId
      ? d
          .select({
            id: projects.id,
            name: projects.name,
            status: projects.status
          })
          .from(projects)
          .where(and(eq(projects.id, presetProjectId), eq(projects.userId, locals.user.id)))
          .get()
      : null
  ]);

  return { presetPerson, presetCompany, presetProject };
};
