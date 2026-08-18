import { error } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { sampleCompanyRecipient, sampleRecipient } from '$lib/server/outreach-sample';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  // Both samples, because the target control is a live switch in the editor.
  const [sample, companySample] = await Promise.all([
    sampleRecipient(s),
    sampleCompanyRecipient(s)
  ]);
  return {
    sample,
    companySample,
    sender: { name: locals.user.username ?? '', email: locals.user.email }
  };
};
