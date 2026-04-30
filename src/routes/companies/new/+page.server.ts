import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveCompany } from '$lib/server/saveCompany';
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
    const result = await saveCompany(locals.user.id, locals.user.region, null, {
      name,
      industry: sanitizePlainText(String(data.get('industry') ?? ''), 200) || null,
      location: sanitizePlainText(String(data.get('location') ?? ''), 200) || null,
      description: String(data.get('description') ?? '') || null,
      notes: String(data.get('notes') ?? '') || null
    });
    throw redirect(303, `/companies/${result.id}`);
  }
};
