import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createCollection } from '$lib/server/collections';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth?next=/collections/new');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });
    const description = String(data.get('description') ?? '').trim() || null;

    let id: string;
    try {
      const result = await createCollection(locals.user.id, locals.user.region, {
        name,
        description
      });
      id = result.id;
    } catch (err) {
      return fail(400, { error: (err as Error).message });
    }

    throw redirect(303, `/collections/${id}?just=1`);
  }
};
