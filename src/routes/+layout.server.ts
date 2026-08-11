import { requireScope } from '$lib/server/scope';
import type { LayoutServerLoad } from './$types';
import { listReminders } from '$lib/server/reminders-query';
import { listMemberships } from '$lib/server/workspaces';
import { listTemplates } from '$lib/server/outreach';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user)
    return { user: null, reminders: [], memberships: [], outreachTemplates: [] };
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
    reminders: listReminders(s, { limit: 25 }),
    /**
     * Template names for the command palette, streamed like the reminders.
     *
     * Commands are matched client-side (`src/lib/commands/fuzzy.ts`), so a
     * template is only findable if its name is in the browser. That is
     * affordable here and is *not* affordable for entities: this is tens of
     * rows, and only the id, name and platform — never a body. Entity search
     * stays on the server, where SQLite does it better.
     */
    outreachTemplates: listTemplates(s, { archived: 'active' }).then((items) =>
      items.map((t) => ({ id: t.id, name: t.name, platform: t.platform }))
    )
  };
};
