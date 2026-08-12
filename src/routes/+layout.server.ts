import { requireScope } from '$lib/server/scope';
import type { LayoutServerLoad } from './$types';
import { listReminders } from '$lib/server/reminders-query';
import { listMemberships } from '$lib/server/workspaces';
import { listTemplateSummaries } from '$lib/server/outreach';
import { getRunningEntry } from '$lib/server/time';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user)
    return {
      user: null,
      reminders: [],
      memberships: [],
      outreachTemplates: [],
      runningEntry: null
    };
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
     *
     * `listTemplateSummaries`, not `listTemplates`: the projection has to happen
     * in SQL. Mapping the columns off afterwards still fetched and decoded every
     * body, on every request in the app, to discard them.
     */
    outreachTemplates: listTemplateSummaries(s, { archived: 'active' }),
    /**
     * The running timer, streamed like the reminders.
     *
     * It lives at the layout so the indicator survives navigation — a timer you
     * can only see on /time is one you forget is running. Unawaited because
     * nothing above the fold depends on it, and the indicator renders nothing
     * at all when there is no timer.
     */
    runningEntry: getRunningEntry(s)
  };
};
