import { requireScope } from '$lib/server/scope';
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
import { listTasksForEntity } from '$lib/server/tasks';
import { domainOf } from '$lib/server/url';

/**
 * Only the header blocks first paint.
 *
 * This page issued twelve queries and awaited all of them before sending a
 * byte. On the cloud's remote libSQL that is twelve round trips of latency
 * before the user sees a name. Everything below the header — timeline, tags,
 * tasks, memberships — is returned as an unawaited promise and streamed, the
 * same pattern `+layout.server.ts` already uses for the reminders popover.
 *
 * The header still needs `person`, `company` and `suggestion` (which renders a
 * banner beside the name), so those three stay awaited.
 */
export const load: PageServerLoad = async ({ locals, params, url, depends }) => {
  if (!locals.user) throw redirect(303, '/auth');
  /**
   * A handle so the page can refresh *itself* without `invalidateAll()`.
   *
   * The detail page re-ran every load in the tree on every field edit. Under
   * master–detail that would also re-run the sibling list query and discard
   * its pagination, because `invalidateAll` bypasses SvelteKit's per-node
   * change detection entirely.
   *
   * Note this load never calls `await parent()`, so `uses.parent` stays false
   * and invalidating the list layout can never cascade into here either. The
   * two nodes refresh independently, which is the whole point.
   */
  depends('heli:person');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  const person = await d
    .select()
    .from(people)
    .where(and(eq(people.id, params.id), eq(people.workspaceId, s.workspaceId)))
    .get();
  if (!person) throw error(404, 'not_found');

  // Banner flags. ?just stays valid until the entity is older than the undo
  // window (~30s grace gives the client a buffer over its 6s countdown);
  // ?dedup stays as long as the flag is set.
  const FRESH_GRACE_MS = 30_000;
  const justSaved =
    url.searchParams.get('just') === '1' && Date.now() - person.createdAt < FRESH_GRACE_MS;
  const dedup = url.searchParams.get('dedup') === '1';

  let company = null;
  if (person.companyId) {
    company =
      (await d
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          logoUrl: companies.logoUrl,
          faviconUrl: companies.faviconUrl
        })
        .from(companies)
        .where(and(eq(companies.id, person.companyId), eq(companies.workspaceId, s.workspaceId)))
        .get()) ?? null;
  }

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
          .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.domain, dom)))
          .get();
        matchId = co?.id ?? null;
      } catch {
        // bad url; fall through
      }
    }
    suggestion = { name: person.suggestedCompanyName, url: person.suggestedCompanyUrl, matchId };
  }

  // Project surfacing needs both queries before it can split them, so the split
  // happens inside one streamed promise rather than blocking the header.
  const companyId = company?.id ?? null;
  const projects = Promise.all([
    projectsForPerson(s, person.id),
    companyId ? projectsTogether(s, person.id, companyId) : Promise.resolve([])
  ]).then(([all, together]) => {
    const togetherIds = new Set(together.map((p) => p.id));
    return { together, other: all.filter((p) => !togetherIds.has(p.id)) };
  });

  return {
    person,
    company,
    suggestion,
    justSaved,
    dedup,
    // Streamed. Each is awaited in the template, so the shell paints first.
    interactions: listInteractions(s, { personId: person.id, limit: 50 }),
    tags: getTagsForEntity(s, 'person', person.id),
    projects,
    collections: listCollectionsForEntity(s, 'person', person.id),
    pipelines: listPipelinesForEntity(s, 'person', person.id),
    tasks: listTasksForEntity(s, 'person', person.id)
  };
};
