import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { listFeeds, redactFeed } from '$lib/server/calendar';

/**
 * Subscribed calendar feeds, **always redacted**.
 *
 * The feed URL *is* the credential — anyone holding it can read the calendar —
 * so `redactFeed` strips it along with `self_emails` and returns a host plus a
 * six-character fingerprint. Do not "helpfully" add a path slice back: harmless
 * for Google, whose last segment is literally `basic.ics`, and a full leak for
 * any provider that puts the token last.
 *
 * Read-only over the API. Adding a feed means pasting a secret URL, which
 * belongs on the web where it is typed once — and `calendar_feeds` is in
 * `PERSONAL_TABLES` precisely because that URL is not the workspace's to hold.
 */
export const GET: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'read');
  const feeds = await listFeeds(s);
  return apiOk(feeds.map(redactFeed));
};
