import { requireScope } from '$lib/server/scope';
import { listTemplates, countTemplates } from '$lib/server/outreach';
import { isOutreachPlatform } from '$lib/outreach/platforms';
import type { PageServerLoad } from './$types';

function isArchivedFilter(v: string | null): v is 'active' | 'archived' | 'all' {
  return v === 'active' || v === 'archived' || v === 'all';
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // Signed-out renders an empty shape rather than throwing, matching the other
  // list pages.
  if (!locals.user) {
    return { items: [], q: '', platform: null, archived: 'active' as const, total: 0 };
  }
  const s = requireScope(locals);

  const q = url.searchParams.get('q')?.trim() ?? '';
  const rawPlatform = url.searchParams.get('platform');
  const platform = isOutreachPlatform(rawPlatform) ? rawPlatform : null;
  const archivedParam = url.searchParams.get('archived');
  const archived = isArchivedFilter(archivedParam) ? archivedParam : 'active';

  const filtered = archived !== 'active' || !!q || !!platform;

  // On a filtered view the total came from running the unfiltered list a second
  // time and reading `.length` — a full second `SELECT *`, every template body
  // included, to produce one integer. The two run in parallel now, and the
  // second is a COUNT.
  const [items, total] = await Promise.all([
    listTemplates(s, {
      q: q || undefined,
      platform: platform ?? undefined,
      archived
    }),
    filtered ? countTemplates(s, { archived: 'active' }) : null
  ]);

  return { items, q, platform, archived, total: total ?? items.length };
};
