import { error, redirect } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { URL_IMPORT_COOKIE, getPendingUrlImport } from '$lib/server/urlImport';
import type { PageServerLoad } from './$types';

/**
 * The review screen's rows come from the load, not a `GET` endpoint.
 *
 * Same bytes, one fewer round trip against an in-process map — and the map is
 * the reason: staging, review and commit already have to reach the same
 * machine, so filtering happens entirely in the browser rather than per
 * keystroke over the wire.
 *
 * Deliberately its own top-level route rather than under `/settings`: this is
 * member work, reached from both list pages, and `/settings/import` is
 * admin-shaped. It is not in `NAV_CACHEABLE` either, so it keeps the
 * `private, no-store` default and staged URLs never reach the service worker.
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  requireScope(locals);

  const token = cookies.get(URL_IMPORT_COOKIE);
  const pending = token ? getPendingUrlImport(token, locals.user.id) : null;
  // Nothing staged means the TTL elapsed or the process restarted. Sending
  // people back to where they came from beats an error page for a state that
  // is recovered by pasting again.
  if (!pending) throw redirect(303, backTo(url));

  return {
    rows: pending.rows.map((r, i) => ({ i, ...r })),
    duplicates: pending.duplicateCount,
    invalid: pending.invalidCount,
    collection: pending.collection,
    // Taken from the staging record when there is one, so a hand-edited
    // `?from=` cannot send someone to a collection this paste never targeted.
    back: pending.collection ? `/collections/${pending.collection.id}` : backTo(url)
  };
};

function backTo(url: URL): '/people' | '/companies' {
  return url.searchParams.get('from') === 'companies' ? '/companies' : '/people';
}
