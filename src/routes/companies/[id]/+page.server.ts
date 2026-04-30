import { error, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { companies, people } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const d = db(locals.user.region);
  const company = await d
    .select()
    .from(companies)
    .where(and(eq(companies.id, params.id), eq(companies.userId, locals.user.id)))
    .get();
  if (!company) throw error(404, 'not_found');

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

  return { company, linkedPeople };
};
