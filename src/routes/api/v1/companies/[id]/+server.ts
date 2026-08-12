import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { fetchCompanyRow } from '$lib/server/companies-rows';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { and, eq } from 'drizzle-orm';
import { sanitize, sanitizePlainText } from '$lib/server/sanitize';
import { bumpSearchEpoch } from '$lib/server/search';

/**
 * The company twin of `people/[id]`. It was simply missing — v1 could list and
 * create companies but not read, edit or delete one — which made a client that
 * could fully manage people unable to do the same for their employers.
 */

const TEXT_FIELDS = ['name', 'industry', 'location', 'sizeBand'] as const;

export const GET: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'read');
  const row = await fetchCompanyRow(s, params.id);
  if (!row) return apiError('not_found', 'No such company.', 404);
  return apiOk(row);
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const f of TEXT_FIELDS) {
    if (f in body) patch[f] = body[f] == null ? null : sanitizePlainText(String(body[f]), 4000);
  }
  // `description` and `notes` are rendered with {@html} by NotesEditor, so they
  // go through the markup sanitizer rather than the plain-text one. Getting
  // this wrong is a stored-XSS that runs in every colleague's session — the
  // exact bug CLAUDE.md records for collections and pipelines.
  for (const f of ['description', 'notes'] as const) {
    if (f in body) patch[f] = body[f] == null ? null : sanitize(String(body[f]));
  }
  if ('isFavorite' in body) patch.isFavorite = body.isFavorite ? 1 : 0;
  if ('isArchived' in body) patch.isArchived = body.isArchived ? 1 : 0;
  if (Object.keys(patch).length === 1) {
    return apiError('invalid_request', 'No writable fields supplied.', 400);
  }

  const res = await db(s.region)
    .update(companies)
    .set(patch)
    .where(and(eq(companies.id, params.id), eq(companies.workspaceId, s.workspaceId)));
  if (res.rowsAffected === 0) return apiError('not_found', 'No such company.', 404);

  bumpSearchEpoch(s.workspaceId);
  return apiOk(await fetchCompanyRow(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const res = await db(s.region)
    .delete(companies)
    .where(and(eq(companies.id, params.id), eq(companies.workspaceId, s.workspaceId)));
  if (res.rowsAffected === 0) return apiError('not_found', 'No such company.', 404);
  bumpSearchEpoch(s.workspaceId);
  return apiOk({ id: params.id, deleted: true });
};
