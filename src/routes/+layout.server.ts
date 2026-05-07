import type { LayoutServerLoad } from './$types';
import { listReminders } from '$lib/server/reminders-query';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) return { user: null, reminders: [] };
  const reminders = await listReminders(locals.user.id, locals.user.region, { limit: 25 });
  return { user: locals.user, reminders };
};
