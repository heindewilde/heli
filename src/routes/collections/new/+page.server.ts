import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createCollection, addToCollection } from '$lib/server/collections';
import type { MemberKind } from '$lib/server/schema';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth?next=/collections/new');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const description = String(data.get('description') ?? '').trim() || null;
    const icon = String(data.get('icon') ?? '').trim() || null;
    const memberEntries = data.getAll('member') as string[];

    let id: string;
    try {
      const result = await createCollection(locals.user.id, locals.user.region, {
        name,
        description,
        icon
      });
      id = result.id;
    } catch (err) {
      return fail(400, { error: (err as Error).message });
    }

    for (const entry of memberEntries) {
      const sep = entry.indexOf(':');
      if (sep < 1) continue;
      const kind = entry.slice(0, sep) as MemberKind;
      const refId = entry.slice(sep + 1);
      if (kind !== 'person' && kind !== 'company') continue;
      try {
        await addToCollection(locals.user.id, locals.user.region, id, kind, refId);
      } catch {
        // non-fatal: member may not exist
      }
    }

    throw redirect(303, `/collections/${id}`);
  }
};
