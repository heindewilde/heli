import type { LayoutServerLoad } from './$types';
import { listReminders } from '$lib/server/reminders-query';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user) return { user: null, reminders: [] };
  // Stream the reminders promise — SvelteKit ships the HTML immediately and
  // resolves the popover's contents in-flight, so the sidebar doesn't gate
  // first paint on a DB query that nothing above-the-fold depends on.
  return {
    user: locals.user,
    reminders: listReminders(locals.user.id, locals.user.region, { limit: 25 })
  };
};
