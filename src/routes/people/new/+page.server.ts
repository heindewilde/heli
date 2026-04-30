import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { savePerson } from '$lib/server/savePerson';
import { sanitizePlainText } from '$lib/server/sanitize';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(303, '/auth');
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth');
    const data = await request.formData();
    const name = sanitizePlainText(String(data.get('name') ?? ''), 200);
    if (!name) return fail(400, { error: 'Name is required.' });
    const result = await savePerson(locals.user.id, locals.user.region, null, {
      name,
      role: sanitizePlainText(String(data.get('role') ?? ''), 200) || null,
      email: sanitizePlainText(String(data.get('email') ?? ''), 254) || null,
      phone: sanitizePlainText(String(data.get('phone') ?? ''), 64) || null,
      location: sanitizePlainText(String(data.get('location') ?? ''), 200) || null,
      notes: String(data.get('notes') ?? '') || null
    });
    throw redirect(303, `/people/${result.id}`);
  }
};
