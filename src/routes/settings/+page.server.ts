import { requireScope } from '$lib/server/scope';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { eq, sql } from 'drizzle-orm';
import { people, companies, interactions, users } from '$lib/server/schema';
import { isEmailConfigured } from '$lib/server/email';
import { OAUTH_SENTINEL } from '$lib/server/auth';
import { getPendingImport, CONTACTS_IMPORT_COOKIE } from '$lib/server/google';
import { listMembers } from '$lib/server/workspaces';
import { listPendingInvites } from '$lib/server/invites';
import { isAdmin } from '$lib/server/scope';
import { listTokens } from '$lib/server/tokens';
import { listDevices, mobileEnabledFor } from '$lib/server/devices';
import { listFeeds, redactFeed } from '$lib/server/calendar';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');
  const s = requireScope(locals);

  const d = db(locals.user.region);
  const origin = url.origin;

  // Hidden until the app is in a store; see `mobileEnabledFor`. Checked here
  // rather than in the markup so a hidden section costs no query either.
  const mobileEnabled = mobileEnabledFor(locals.user.email);

  /**
   * One wave, not four.
   *
   * Nothing here depends on anything else here, but the tokens and the calendar
   * feeds used to be awaited one after the other behind two earlier `Promise.all`
   * groups — four sequential waves for eight independent queries. Against remote
   * libSQL each wave is a full round trip added to time-to-first-byte.
   *
   * `listMemberships` is deliberately absent: the root layout already fetches it
   * for the workspace switcher, and page data inherits from layout data, so
   * asking again was a duplicated round trip on every settings load.
   */
  const [p, c, i, u, members, invites, apiTokens, feeds, devices] = await Promise.all([
    d.select({ n: sql<number>`COUNT(*)` }).from(people).where(eq(people.workspaceId, s.workspaceId)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(companies).where(eq(companies.workspaceId, s.workspaceId)).get(),
    d.select({ n: sql<number>`COUNT(*)` }).from(interactions).where(eq(interactions.workspaceId, s.workspaceId)).get(),
    d.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, locals.user.id)).get(),
    listMembers(s.region, s.workspaceId),
    // Pending invites carry a live join link, so only admins may see them.
    isAdmin(s) ? listPendingInvites(s.region, s.workspaceId, origin) : Promise.resolve([]),
    listTokens(s),
    listFeeds(s),
    // Devices are user-scoped, not workspace-scoped — they follow their owner
    // across every workspace, so this is keyed by (region, user) with no
    // workspace filter. See the `devices` table in schema.ts.
    mobileEnabled ? listDevices(s.region, s.userId) : Promise.resolve([])
  ]);

  const googleAuthEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  // Redacted: the feed URL is the credential and must never reach a client.
  const calendars = feeds.map(redactFeed);

  // A staged import is resolved on every load rather than behind a query param:
  // reviewing and committing belong to /settings/import now, and this is only
  // the way back for someone who navigated away mid-triage. Counts only — the
  // rows themselves would be most of this page's payload.
  let pendingImport: { totalToImport: number; duplicateCount: number } | null = null;

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (importId) {
    const pending = getPendingImport(importId, locals.user.id);
    if (pending) {
      pendingImport = {
        totalToImport: pending.toImport.length,
        duplicateCount: pending.duplicateCount
      };
    }
  }

  return {
    calendars,
    apiTokens,
    devices,
    mobileEnabled,
    user: locals.user,
    workspace: {
      id: s.workspaceId,
      name: locals.user.workspaceName,
      role: s.role
    },
    members,
    invites,
    counts: {
      people: Number(p?.n ?? 0),
      companies: Number(c?.n ?? 0),
      interactions: Number(i?.n ?? 0)
    },
    origin,
    emailConfigured: isEmailConfigured(),
    hasPassword: !!u && u.passwordHash !== OAUTH_SENTINEL,
    googleAuthEnabled,
    pendingImport,
    importError: url.searchParams.get('import_error') ?? null
  };
};
