import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { projectsForPerson, projectsTogether } from '$lib/server/projects-query';
import { getTagsForEntity } from '$lib/server/tags';
import { listCollectionsForEntity } from '$lib/server/collections';
import { listPipelinesForEntity } from '$lib/server/pipelines';
import { domainOf } from '$lib/server/url';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const d = db(locals.user.region);
  const person = await d
    .select()
    .from(people)
    .where(and(eq(people.id, params.id), eq(people.userId, locals.user.id)))
    .get();
  if (!person) throw error(404, 'not_found');

  // Banner flags. ?just stays valid until the entity is older than the undo
  // window (~30s grace gives the client a buffer over its 6s countdown);
  // ?dedup stays as long as the flag is set.
  const FRESH_GRACE_MS = 30_000;
  const justSaved = url.searchParams.get('just') === '1' && Date.now() - person.createdAt < FRESH_GRACE_MS;
  const dedup = url.searchParams.get('dedup') === '1';

  let company = null;
  if (person.companyId) {
    company = await d
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        logoUrl: companies.logoUrl,
        faviconUrl: companies.faviconUrl
      })
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

  // Project surfacing. Two queries:
  // - projectsAll: every active project this person is on
  // - projectsTogetherList: subset that ALSO includes the linked company
  const [projectsAll, projectsTogetherList] = await Promise.all([
    projectsForPerson(locals.user.id, locals.user.region, person.id),
    company
      ? projectsTogether(locals.user.id, locals.user.region, person.id, company.id)
      : Promise.resolve([])
  ]);
  const togetherIds = new Set(projectsTogetherList.map((p) => p.id));
  // "Other projects" = projects this person is on that the company isn't.
  const projectsOther = projectsAll.filter((p) => !togetherIds.has(p.id));

  const [collections, pipelines] = await Promise.all([
    listCollectionsForEntity(locals.user.id, locals.user.region, 'person', person.id),
    listPipelinesForEntity(locals.user.id, locals.user.region, 'person', person.id)
  ]);

  return {
    person,
    company,
    interactions,
    tags,
    suggestion,
    justSaved,
    dedup,
    projectsTogether: projectsTogetherList,
    projectsOther,
    collections,
    pipelines
  };
};
