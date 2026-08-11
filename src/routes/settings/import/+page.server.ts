import { requireScope, isAdmin } from '$lib/server/scope';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPendingImport, CONTACTS_IMPORT_COOKIE } from '$lib/server/contactImport';

/**
 * Review a staged contact import before committing it.
 *
 * Its own route rather than another block on the settings page: this is a table
 * of a few thousand rows with its own filter state, and settings is already long.
 *
 * The rows are served straight from the load. A `GET` endpoint would move the
 * same bytes for an extra round trip against an in-process map, and the pending
 * import already assumes stage, review and commit reach the same machine. All
 * filtering then happens in the browser — no request per keystroke.
 *
 * `/settings*` gets the `private, no-store` default from `hooks.server.ts`, so a
 * few thousand staged contacts never reach the service worker's caches.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');
  const s = requireScope(locals);
  // Committing is admin-only (it ends in an unbounded bulk insert), so don't
  // render a review screen that 403s at the last step.
  if (!isAdmin(s)) throw redirect(303, '/settings');

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  const pending = importId ? getPendingImport(importId, s.userId) : null;
  // Never staged, already committed, or expired past the 15-minute TTL — from
  // here they are the same thing: there is nothing to review.
  if (!pending) throw redirect(303, '/settings');

  return {
    source: pending.source,
    duplicateCount: pending.duplicateCount,
    /**
     * Only what the table renders. `url`, `phone`, `location` and `notes` are
     * committed but never shown, and across a few thousand connections they are
     * most of the payload. `i` is the index into the staged list, which is what
     * the commit takes back.
     */
    rows: pending.toImport.map((p, i) => ({
      i,
      name: p.name,
      email: p.email,
      role: p.role,
      company: p.suggestedCompanyName,
      connectedOn: p.connectedOn ?? null
    }))
  };
};
