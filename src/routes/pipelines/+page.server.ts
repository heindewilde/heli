import { requireScope } from '$lib/server/scope';
import type { PageServerLoad } from './$types';
import { listPipelines } from '$lib/server/pipelines';

function isArchivedFilter(v: string | null): v is 'active' | 'archived' | 'all' {
  return v === 'active' || v === 'archived' || v === 'all';
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    return { items: [], q: '', archived: 'active' as const, sort: 'updated' as const, total: 0 };
  }
  const s = requireScope(locals);

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

  const items = await listPipelines(s, {
    q,
    archived,
    sort,
    limit: 200
  });

  const totalActive =
    archived === 'active'
      ? items.length
      : (await listPipelines(s, { archived: 'active', limit: 500 }))
          .length;

  return { items, q, archived, sort, total: totalActive };
};
