import { requireScope } from '$lib/server/scope';
import type { LayoutServerLoad } from './$types';
import { listReminders } from '$lib/server/reminders-query';
import { listMemberships } from '$lib/server/workspaces';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) return { user: null, reminders: [], memberships: [] };
  const s = requireScope(locals);
  // Stream the reminders promise — SvelteKit ships the HTML immediately and
  // resolves the popover's contents in-flight, so the sidebar doesn't gate
  // first paint on a DB query that nothing above-the-fold depends on.
  //
  // Memberships are awaited, not streamed: the switcher sits in the topbar and
  // popping in after paint would shift the header.
  return {
    user: locals.user,
    memberships: await listMemberships(s.region, s.userId),
    reminders: listReminders(s, { limit: 25 })
  };
};
