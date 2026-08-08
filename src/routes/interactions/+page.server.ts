import { requireScope } from '$lib/server/scope';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listInteractions } from '$lib/server/interactions-query';
import { INTERACTION_TYPES } from '$lib/server/saveInteraction';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(303, '/auth');
  const s = requireScope(locals);
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

  const items = await listInteractions(s, {
    q,
    personId,
    companyId,
    type,
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined,
    limit: 50
  });

  return {
    q,
    personId: personId ?? null,
    companyId: companyId ?? null,
    type: type ?? null,
    from: fromRaw ?? '',
    to: toRaw ?? '',
    items
  };
};
