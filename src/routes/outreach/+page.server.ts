import { requireScope } from '$lib/server/scope';
import { listTemplates } from '$lib/server/outreach';
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

  const items = await listTemplates(s, {
    q: q || undefined,
    platform: platform ?? undefined,
    archived
  });

  const total =
    archived === 'active' && !q && !platform
      ? items.length
      : (await listTemplates(s, { archived: 'active' })).length;

  return { items, q, platform, archived, total };
};
