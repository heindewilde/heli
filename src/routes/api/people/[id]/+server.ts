import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { sanitize, sanitizePlainText } from '$lib/server/sanitize';

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
  avatarUrl: (v) => (v == null ? null : String(v).slice(0, 2048))
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const d = db(locals.user.region);
  const id = params.id!;
  const existing = await d
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, locals.user.id)))
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

  await d.update(people).set(updates).where(and(eq(people.id, id), eq(people.userId, locals.user.id)));
  const fresh = await d.select().from(people).where(eq(people.id, id)).get();
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const d = db(locals.user.region);
  const id = params.id!;
  await d.delete(people).where(and(eq(people.id, id), eq(people.userId, locals.user.id)));
  return new Response(null, { status: 204 });
};
