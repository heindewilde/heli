import type { PageServerLoad } from './$types';
import { listCollections } from '$lib/server/collections';

function isArchivedFilter(v: string | null): v is 'active' | 'archived' | 'all' {
  return v === 'active' || v === 'archived' || v === 'all';
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    return { items: [], q: '', archived: 'active' as const, sort: 'updated' as const, total: 0 };
  }

  const q = url.searchParams.get('q')?.trim() ?? '';
  const archivedParam = url.searchParams.get('archived');
  const archived: 'active' | 'archived' | 'all' = isArchivedFilter(archivedParam)
    ? archivedParam
    : 'active';
  const sortParam = url.searchParams.get('sort');
  const sort =
    sortParam === 'updated' || sortParam === 'recent' || sortParam === 'name'
      ? sortParam
      : 'updated';

  const items = await listCollections(locals.user.id, locals.user.region, {
    q,
    archived,
    sort,
    limit: 200
  });

  // Total = active count for the header pill.
  const totalActive =
    archived === 'active'
      ? items.length
      : (await listCollections(locals.user.id, locals.user.region, { archived: 'active', limit: 500 }))
          .length;

  return { items, q, archived, sort, total: totalActive };
};
