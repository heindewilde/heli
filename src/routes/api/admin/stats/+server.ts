import { error, json } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import { db, REGIONS, isMultiRegion } from '$lib/server/db';
import { users } from '$lib/server/schema';

export const GET = async ({ request }) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw error(403, 'ADMIN_SECRET not configured');

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) throw error(401, 'unauthorized');

  const multi = isMultiRegion();

  if (!multi) {
    const [row] = await db().select({ n: count() }).from(users);
    return json({ total: row?.n ?? 0, multiRegion: false });
  }

  const byRegion: Record<string, number> = {};
  await Promise.all(
    REGIONS.map(async (region) => {
      const [row] = await db(region).select({ n: count() }).from(users);
      byRegion[region] = row?.n ?? 0;
    })
  );

  const total = Object.values(byRegion).reduce((a, b) => a + b, 0);
  return json({ total, byRegion, multiRegion: true });
};
