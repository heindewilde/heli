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
import { countTemplates } from '$lib/server/outreach';

export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
  if (!locals.user) throw redirect(303, '/auth');
  // Refresh this record without invalidateAll(). See people/[id] for the full
  // reasoning; the short version is that invalidateAll bypasses per-node
  // change detection and would re-run the sibling list query too.
  depends('heli:company');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  // Only the header blocks first paint; everything else streams. See the note
  // on the person detail load — same reasoning, same pattern.
  //
  // These two run together rather than one after the other: the people query
  // filters on `params.id`, which is already in hand, so waiting for the company
  // row first bought nothing but a round trip in front of first paint. The 404
  // is still decided by the company result.
  const companyPromise = d
    .select()
    .from(companies)
    .where(and(eq(companies.id, params.id), eq(companies.workspaceId, s.workspaceId)))
    .get();

  const linkedPeoplePromise = d
    .select({
      id: people.id,
      name: people.name,
      role: people.role,
      avatarUrl: people.avatarUrl,
      isFavorite: people.isFavorite,
      isArchived: people.isArchived,
      // For the outreach composer: a template addresses a person, so writing
      // from a company means picking one of these. Extra columns on a row this
      // query already fetches — no additional round trip.
      email: people.email,
      location: people.location,
      phone: people.phone,
      linkedinUrl: people.linkedinUrl,
      xUrl: people.xUrl
    })
    .from(people)
    .where(and(eq(people.companyId, params.id), eq(people.workspaceId, s.workspaceId), eq(people.isArchived, 0)))
    .orderBy(desc(people.updatedAt))
    .limit(50);

  // A COUNT, not a list: the header only needs to know whether the "Write to
  // {company}" option exists at all — the dialog fetches the templates itself.
  const [company, linkedPeople, companyTemplateCount] = await Promise.all([
    companyPromise,
    linkedPeoplePromise,
    countTemplates(s, { target: 'company', archived: 'active' })
  ]);
  if (!company) throw error(404, 'not_found');

  const FRESH_GRACE_MS = 30_000;
  const justSaved = url.searchParams.get('just') === '1' && Date.now() - company.createdAt < FRESH_GRACE_MS;
  const dedup = url.searchParams.get('dedup') === '1';

  return {
    company,
    linkedPeople,
    hasCompanyTemplates: companyTemplateCount > 0,
    justSaved,
    dedup,
    // Streamed — awaited in the template.
    interactions: listInteractions(s, { companyId: company.id, limit: 50 }),
    tags: getTagsForEntity(s, 'company', company.id),
    projects: projectsForCompany(s, company.id),
    collections: listCollectionsForEntity(s, 'company', company.id),
    pipelines: listPipelinesForEntity(s, 'company', company.id),
    tasks: listTasksForEntity(s, 'company', company.id)
  };
};
