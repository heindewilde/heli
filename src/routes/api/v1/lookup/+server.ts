import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { people, companies } from '$lib/server/schema';
import { cleanUrl, UrlError } from '$lib/server/url';

/**
 * "Do you already have this URL?" — the call the browser extension makes while
 * the content script is still parsing, so the popup can open straight into
 * "Already in Heli" instead of offering to create a duplicate.
 *
 * Deliberately cheap: two indexed lookups on the same unique key
 * (workspace_id, url) that `savePerson`/`saveCompany` dedupe against, so the
 * answer here and the behaviour on save cannot disagree.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const raw = url.searchParams.get('url');
  if (!raw) return apiError('invalid_request', 'A `url` parameter is required.', 400);

  let cleaned: string;
  try {
    cleaned = cleanUrl(raw);
  } catch (err) {
    return apiError('invalid_request', err instanceof UrlError ? err.message : 'Bad URL.', 400);
  }

  const d = db(s.region);
  const [person, company] = await Promise.all([
    d
      .select({ id: people.id, name: people.name, updatedAt: people.updatedAt })
      .from(people)
      .where(and(eq(people.workspaceId, s.workspaceId), eq(people.url, cleaned)))
      .get(),
    d
      .select({ id: companies.id, name: companies.name, updatedAt: companies.updatedAt })
      .from(companies)
      .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.url, cleaned)))
      .get()
  ]);

  if (person) return apiOk({ found: true, kind: 'person', ...person, url: cleaned });
  if (company) return apiOk({ found: true, kind: 'company', ...company, url: cleaned });
  return apiOk({ found: false, url: cleaned });
};
