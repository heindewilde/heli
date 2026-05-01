import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const d = db(locals.user.region);
  const person = await d
    .select()
    .from(people)
    .where(and(eq(people.id, params.id), eq(people.userId, locals.user.id)))
    .get();
  if (!person) throw error(404, 'not_found');

  let company = null;
  if (person.companyId) {
    company = await d
      .select({ id: companies.id, name: companies.name, domain: companies.domain })
      .from(companies)
      .where(and(eq(companies.id, person.companyId), eq(companies.userId, locals.user.id)))
      .get();
  }

  const interactions = await listInteractions(locals.user.id, locals.user.region, {
    personId: person.id,
    limit: 50
  });

  return { person, company, interactions };
};
