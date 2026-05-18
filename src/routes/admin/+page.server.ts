import { fail, redirect } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, REGIONS, REGION_LABELS, isMultiRegion } from '$lib/server/db';
import { users } from '$lib/server/schema';

const COOKIE = 'admin_session';
const COOKIE_TTL = 60 * 60 * 24 * 7; // 7 days

function isAuthed(cookies: import('@sveltejs/kit').Cookies): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return cookies.get(COOKIE) === secret;
}

export const load: PageServerLoad = async ({ cookies }) => {
  if (!isAuthed(cookies)) return { authed: false as const };

  const multi = isMultiRegion();

  if (!multi) {
    const [row] = await db().select({ n: count() }).from(users);
    return { authed: true as const, total: row?.n ?? 0, byRegion: null };
  }

  const byRegion: { region: string; label: string; count: number }[] = [];
  await Promise.all(
    REGIONS.map(async (region) => {
      const [row] = await db(region).select({ n: count() }).from(users);
      byRegion.push({ region, label: REGION_LABELS[region], count: row?.n ?? 0 });
    })
  );
  byRegion.sort((a, b) => b.count - a.count);

  const total = byRegion.reduce((s, r) => s + r.count, 0);
  return { authed: true as const, total, byRegion };
};

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return fail(403, { error: 'Admin access not configured.' });

    const data = await request.formData();
    if (data.get('secret') !== secret) return fail(401, { error: 'Wrong secret.' });

    cookies.set(COOKIE, secret, {
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_TTL
    });
    redirect(303, '/admin');
  },

  logout: async ({ cookies }) => {
    cookies.delete(COOKIE, { path: '/admin' });
    redirect(303, '/admin');
  }
};
