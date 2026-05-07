import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { getTagsForEntity } from '$lib/server/tags';
import { domainOf } from '$lib/server/url';

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

  const tags = await getTagsForEntity(locals.user.id, locals.user.region, 'person', person.id);

  // Re-check the suggested company against the user's companies on each load — a
  // matching company added later should auto-link instead of remaining a banner.
  let suggestion: { name: string; url: string | null; matchId: string | null } | null = null;
  if (!person.companyId && person.suggestedCompanyName) {
    let matchId: string | null = null;
    if (person.suggestedCompanyUrl) {
      try {
        const dom = domainOf(new URL(person.suggestedCompanyUrl));
        const co = await d
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.userId, locals.user.id), eq(companies.domain, dom)))
          .get();
        matchId = co?.id ?? null;
      } catch {
        // bad url; fall through
      }
    }
    suggestion = {
      name: person.suggestedCompanyName,
      url: person.suggestedCompanyUrl,
      matchId
    };
  }

  return { person, company, interactions, tags, suggestion };
};
