import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { companies } from '$lib/server/schema';
import { sanitize, sanitizePlainText } from '$lib/server/sanitize';

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
  notes: (v) => (v == null ? null : sanitize(String(v))),
  isFavorite: (v) => (v ? 1 : 0),
  isArchived: (v) => (v ? 1 : 0),
  logoUrl: (v) => (v == null ? null : String(v).slice(0, 2048)),
  priority: coercePriority,
  statusId: (v) => (v == null || v === '' ? null : String(v))
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const d = db(locals.user.region);
  const id = params.id!;
  const existing = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.userId, locals.user.id)))
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

  await d.update(companies).set(updates).where(and(eq(companies.id, id), eq(companies.userId, locals.user.id)));
  const fresh = await d.select().from(companies).where(eq(companies.id, id)).get();
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const d = db(locals.user.region);
  const id = params.id!;
  await d.delete(companies).where(and(eq(companies.id, id), eq(companies.userId, locals.user.id)));
  return new Response(null, { status: 204 });
};
