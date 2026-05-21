import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { people, companies, interactions, users } from '$lib/server/schema';
import { isEmailConfigured } from '$lib/server/email';
import { OAUTH_SENTINEL } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');

  const d = db(locals.user.region);
  const [p, c, i, u] = await Promise.all([
    d.select({ n: sql<number>`COUNT(*)` }).from(people).where(eq(people.userId, locals.user.id)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(companies).where(eq(companies.userId, locals.user.id)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(interactions).where(eq(interactions.userId, locals.user.id)).get(),
    d.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, locals.user.id)).get()
  ]);

  // Build the bookmarklet against the request's origin so it points back at
  // *this* deployment (localhost in dev, heli.so in prod, your-host.example
  // when self-hosted). Document the same-origin caveat in the UI.
  const origin = url.origin;

  return {
    user: locals.user,
    counts: {
      people: Number(p?.n ?? 0),
      companies: Number(c?.n ?? 0),
      interactions: Number(i?.n ?? 0)
    },
    origin,
    emailConfigured: isEmailConfigured(),
    hasPassword: !!u && u.passwordHash !== OAUTH_SENTINEL
  };
};
