import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { sanitize, sanitizePlainText } from '$lib/server/sanitize';

// `priority`: null = no priority. 1=high, 2=medium, 3=low. Anything else
// coerces to null so a malformed client can't poison the column.
function coercePriority(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

const ALLOWED: Record<string, (v: unknown) => unknown> = {
  name: (v) => sanitizePlainText(String(v ?? ''), 200),
  role: (v) => (v == null ? null : sanitizePlainText(String(v), 200) || null),
  companyId: (v) => (v == null || v === '' ? null : String(v)),
  email: (v) => (v == null ? null : sanitizePlainText(String(v), 254) || null),
  phone: (v) => (v == null ? null : sanitizePlainText(String(v), 64) || null),
  location: (v) => (v == null ? null : sanitizePlainText(String(v), 200) || null),
  notes: (v) => (v == null ? null : sanitize(String(v))),
  isFavorite: (v) => (v ? 1 : 0),
  isArchived: (v) => (v ? 1 : 0),
  avatarUrl: (v) => (v == null ? null : String(v).slice(0, 2048)),
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
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, id), eq(people.workspaceId, s.workspaceId)))
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
  if (Object.keys(updates).length === 1) throw error(400, 'no_updates');
  if ('name' in updates && !updates.name) throw error(400, 'missing_name');

  if ('companyId' in updates && updates.companyId) {
    updates.suggestedCompanyName = null;
    updates.suggestedCompanyUrl = null;
  }

  await d.update(people).set(updates).where(and(eq(people.id, id), eq(people.workspaceId, s.workspaceId)));
  const fresh = await d.select().from(people).where(eq(people.id, id)).get();
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  const id = params.id!;
  await d.delete(people).where(and(eq(people.id, id), eq(people.workspaceId, s.workspaceId)));
  return new Response(null, { status: 204 });
};
