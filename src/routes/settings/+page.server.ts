import { requireScope } from '$lib/server/scope';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { people, companies, interactions, users } from '$lib/server/schema';
import { isEmailConfigured } from '$lib/server/email';
import { OAUTH_SENTINEL } from '$lib/server/auth';
import { getPendingImport, CONTACTS_IMPORT_COOKIE } from '$lib/server/google';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');
  const s = requireScope(locals);

  const d = db(locals.user.region);
  const [p, c, i, u] = await Promise.all([
    d.select({ n: sql<number>`COUNT(*)` }).from(people).where(eq(people.workspaceId, s.workspaceId)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(companies).where(eq(companies.workspaceId, s.workspaceId)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(interactions).where(eq(interactions.workspaceId, s.workspaceId)).get(),
    d.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, locals.user.id)).get()
  ]);

  const origin = url.origin;
  const googleAuthEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  // Resolve any pending contacts import
  let pendingImport: {
    token: string;
    preview: Array<{ name: string; email: string | null }>;
    totalToImport: number;
    duplicateCount: number;
  } | null = null;

  if (url.searchParams.get('import') === 'contacts') {
    const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
    if (importId) {
      const pending = getPendingImport(importId, locals.user.id);
      if (pending) {
        pendingImport = {
          token: importId,
          preview: pending.toImport.slice(0, 10).map((c) => ({ name: c.name, email: c.email })),
          totalToImport: pending.toImport.length,
          duplicateCount: pending.duplicateCount
        };
      }
    }
  }

  return {
    user: locals.user,
    counts: {
      people: Number(p?.n ?? 0),
      companies: Number(c?.n ?? 0),
      interactions: Number(i?.n ?? 0)
    },
    origin,
    emailConfigured: isEmailConfigured(),
    hasPassword: !!u && u.passwordHash !== OAUTH_SENTINEL,
    googleAuthEnabled,
    pendingImport,
    importError: url.searchParams.get('import_error') ?? null
  };
};
