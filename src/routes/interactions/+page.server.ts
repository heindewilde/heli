import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listInteractions } from '$lib/server/interactions-query';
import { INTERACTION_TYPES } from '$lib/server/saveInteraction';
import {
  entityIdsForTag,
  findTagBySlug,
  getTagsForEntities,
  listTagsWithCounts
} from '$lib/server/tags';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const personId = url.searchParams.get('person') ?? undefined;
  const companyId = url.searchParams.get('company') ?? undefined;
  const typeRaw = url.searchParams.get('type');
  const type =
    typeRaw && (INTERACTION_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : undefined;
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw ? new Date(fromRaw).getTime() : undefined;
  const to = toRaw ? new Date(toRaw).getTime() + 86_400_000 - 1 : undefined;
  const tagSlug = url.searchParams.get('tag');

  let activeTag: { id: string; name: string; slug: string } | null = null;
  let tagFilterIds: string[] | null = null;
  if (tagSlug) {
    const t = await findTagBySlug(locals.user.id, locals.user.region, 'interaction', tagSlug);
    if (t) {
      activeTag = { id: t.id, name: t.name, slug: t.slug };
      tagFilterIds = await entityIdsForTag(locals.user.id, locals.user.region, 'interaction', t.id);
    }
  }

  let items = await listInteractions(locals.user.id, locals.user.region, {
    q,
    personId,
    companyId,
    type,
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined
  });
  if (tagFilterIds) {
    const set = new Set(tagFilterIds);
    items = items.filter((i) => set.has(i.id));
  }

  const tagMap = await getTagsForEntities(
    locals.user.id,
    locals.user.region,
    'interaction',
    items.map((i) => i.id)
  );
  const itemTags: Record<string, { id: string; name: string; slug: string }[]> = {};
  for (const [k, v] of tagMap) itemTags[k] = v;

  const allTags = await listTagsWithCounts(locals.user.id, locals.user.region, 'interaction');

  return {
    q,
    personId: personId ?? null,
    companyId: companyId ?? null,
    type: type ?? null,
    from: fromRaw ?? '',
    to: toRaw ?? '',
    tag: activeTag,
    allTags,
    itemTags,
    items
  };
};
