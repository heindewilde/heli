import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { sanitize, sanitizePlainText } from '$lib/server/sanitize';
import { cleanUrl, domainOf, UrlError } from '$lib/server/url';

/** Walks the cause chain — see the call site for why the top message is not enough. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, hops = 0; e && hops < 5; hops++) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && /UNIQUE constraint failed/i.test(m)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

function coercePriority(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

const ALLOWED: Record<string, (v: unknown) => unknown> = {
  name: (v) => sanitizePlainText(String(v ?? ''), 200),
  description: (v) => (v == null ? null : sanitize(String(v))),
  industry: (v) => (v == null ? null : sanitizePlainText(String(v), 200) || null),
  sizeBand: (v) => (v == null ? null : sanitizePlainText(String(v), 64) || null),
  location: (v) => (v == null ? null : sanitizePlainText(String(v), 200) || null),
  // A company is addressable now — outreach can be written to it directly, so
  // these are as editable as a person's have always been.
  email: (v) => (v == null ? null : sanitizePlainText(String(v), 254) || null),
  phone: (v) => (v == null ? null : sanitizePlainText(String(v), 64) || null),
  notes: (v) => (v == null ? null : sanitize(String(v))),
  isFavorite: (v) => (v ? 1 : 0),
  isArchived: (v) => (v ? 1 : 0),
  logoUrl: (v) => (v == null ? null : String(v).slice(0, 2048)),
  linkedinUrl: (v) => (v == null || v === '' ? null : String(v).slice(0, 2048)),
  xUrl: (v) => (v == null || v === '' ? null : String(v).slice(0, 2048)),
  priority: coercePriority,
  statusId: (v) => (v == null || v === '' ? null : String(v))
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  const id = params.id!;
  const existing = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspaceId)))
    .get();
  if (!existing) throw error(404, 'not_found');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(body)) {
    if (k in ALLOWED) updates[k] = ALLOWED[k](v);
  }
  /**
   * `url` is handled apart from `ALLOWED` because it is not just a field.
   *
   * It is the workspace's dedupe key — `uq_companies_ws_url`, the same value
   * `/api/v1/lookup` matches on — so it has to be normalised through the exact
   * `cleanUrl` a capture would use, or the two spellings stop being one record.
   * `domain` is derived from it and drives the logo, so it moves with it.
   */
  if ('url' in body) {
    const raw = body.url;
    if (raw == null || String(raw).trim() === '') {
      updates.url = null;
      updates.domain = null;
    } else {
      try {
        const u = new URL(cleanUrl(String(raw)));
        updates.url = u.toString();
        updates.domain = domainOf(u);
      } catch (err) {
        throw error(400, err instanceof UrlError ? 'invalid_url' : 'invalid_url');
      }
    }
  }

  if (Object.keys(updates).length === 1) throw error(400, 'no_updates');
  if ('name' in updates && !updates.name) throw error(400, 'missing_name');

  try {
    await d
      .update(companies)
      .set(updates)
      .where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspaceId)));
  } catch (err) {
    // The unique index is the only thing this write can trip. Reported rather
    // than surfaced as a 500, because "another company already has that site"
    // is something the user can act on.
    //
    // The cause chain, not `err.message`: libSQL wraps the driver error as
    // "Failed query: update ..." and the constraint text is a level or two
    // down, so testing the top message alone silently never matches.
    if (isUniqueViolation(err)) throw error(409, 'duplicate_url');
    throw err;
  }
  const fresh = await d.select().from(companies).where(eq(companies.id, id)).get();
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  const id = params.id!;
  await d.delete(companies).where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspaceId)));
  return new Response(null, { status: 204 });
};
