import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { requireScope } from '$lib/server/scope';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';
import { cleanUrl, domainOf } from '$lib/server/url';
import { classify, deriveHandle, humanizeHandle } from '$lib/server/classify';
import { extractUrls } from '$lib/server/urlList';
import {
  URL_IMPORT_COOKIE,
  MAX_URL_IMPORT_ROWS,
  UrlImportTooLargeError,
  storePendingUrlImport,
  deletePendingUrlImport,
  type MappedUrl
} from '$lib/server/urlImport';
import { checkRateLimit, LIMITS } from '$lib/server/rate-limit';
import { getCollectionSummary } from '$lib/server/collections';
import { dev } from '$app/environment';

/** 1 MB of pasted text is ~20,000 URLs; the row cap bites long before this. */
const MAX_BYTES = 1024 * 1024;
const MATCH_CHUNK = 200;

/**
 * Stage a paste for review.
 *
 * Nothing is written to the database here. The URLs are extracted, normalised,
 * classified and checked against what the workspace already holds; the result
 * lives in memory until the user commits it from `/import/urls`.
 */
export const POST: RequestHandler = async ({ request, url, locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  // Same reasoning as the bookmarklet: pasting links is ordinary CRM work, so
  // it is bounded rather than role-gated. Throws `RateLimitError`, which
  // `hooks.server.ts` turns into a 429.
  checkRateLimit(LIMITS.urlImport, locals.user.id);

  /**
   * An optional destination, validated here rather than at commit time. The
   * commit deliberately accepts nothing from the client but indices into a list
   * the server parsed itself; a write target arriving with the commit body
   * would be the one exception, so it rides on the staging record instead.
   *
   * A query param rather than a body field: `readBody` already branches three
   * ways over the paste's content type, and a JSON branch for one id would be a
   * fourth.
   */
  const collectionId = url.searchParams.get('collection');
  let collection = null;
  if (collectionId) {
    collection = await getCollectionSummary(s, collectionId);
    // Raised before any parsing: a bad id should cost nothing.
    if (!collection) throw error(400, 'unknown_collection');
  }

  const raw = await readBody(request);
  if (!raw.trim()) throw error(400, 'empty_paste');

  const found = extractUrls(raw);
  if (found.length === 0) throw error(400, 'no_urls');

  // Normalise first, so the dedupe below compares the same spellings the
  // unique index does.
  const cleaned: { url: string; u: URL }[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;
  for (const candidate of found) {
    try {
      const u = new URL(cleanUrl(candidate));
      const url = u.toString();
      if (seen.has(url)) continue;
      seen.add(url);
      cleaned.push({ url, u });
    } catch {
      // Counted, not thrown: one unparseable line must not cost the paste.
      invalidCount += 1;
    }
  }
  if (cleaned.length === 0) throw error(400, 'no_urls');
  if (cleaned.length > MAX_URL_IMPORT_ROWS) throw error(413, 'too_many_rows');

  // Two chunked queries for the whole paste rather than a lookup per row —
  // against remote libSQL the round trips are the cost. Same shape as the
  // LinkedIn stager.
  const urls = cleaned.map((c) => c.url);
  const [existingPeople, existingCompanies] = await Promise.all([
    lookupExisting(s.region, s.workspaceId, urls, 'person'),
    lookupExisting(s.region, s.workspaceId, urls, 'company')
  ]);

  let duplicateCount = 0;
  const rows: MappedUrl[] = cleaned.map(({ url, u }) => {
    const existingId = existingPeople.get(url) ?? existingCompanies.get(url) ?? null;
    if (existingId) duplicateCount += 1;
    // Whichever table already holds it wins over `classify`, so re-pasting a
    // link cannot flip a record's kind.
    const kind = existingPeople.has(url)
      ? 'person'
      : existingCompanies.has(url)
        ? 'company'
        : classify(u);
    return {
      url,
      kind,
      host: domainOf(u),
      suggestedName:
        kind === 'company'
          ? domainOf(u)
          : (humanizeHandle(deriveHandle(u)) ?? domainOf(u)),
      existingId
    };
  });

  let token: string;
  try {
    token = storePendingUrlImport(locals.user.id, rows, duplicateCount, invalidCount, collection);
  } catch (err) {
    if (err instanceof UrlImportTooLargeError) throw error(413, 'too_many_rows');
    throw err;
  }

  cookies.set(URL_IMPORT_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 900
  });

  return json({
    staged: rows.length,
    duplicates: duplicateCount,
    invalid: invalidCount,
    collection
  });
};

/** Discard a staged paste — the Cancel button on the review screen. */
export const DELETE: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  deletePendingUrlImport(locals.user.id);
  cookies.delete(URL_IMPORT_COOKIE, { path: '/' });
  return new Response(null, { status: 204 });
};

async function readBody(request: Request): Promise<string> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (file instanceof File) {
      if (file.size > MAX_BYTES) throw error(413, 'file_too_large');
      return await file.text();
    }
    return String(form.get('text') ?? '');
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) throw error(413, 'file_too_large');
  return text;
}

async function lookupExisting(
  region: string,
  workspaceId: string,
  urls: string[],
  kind: 'person' | 'company'
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const table = kind === 'person' ? people : companies;
  for (let i = 0; i < urls.length; i += MATCH_CHUNK) {
    const chunk = urls.slice(i, i + MATCH_CHUNK);
    const rows = await db(region)
      .select({ id: table.id, url: table.url })
      .from(table)
      .where(and(eq(table.workspaceId, workspaceId), inArray(table.url, chunk)));
    for (const r of rows) if (r.url) out.set(r.url, r.id);
  }
  return out;
}
