import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { intOr, previewFeed, redactFeed, syncFeed } from '$lib/server/calendar';
import { sanitizePlainText } from '$lib/server/sanitize';

/** A feed belongs to one person — see PERSONAL_TABLES. */
async function own(locals: App.Locals, id: string) {
  const s = requireScope(locals);
  const feed = await db(s.region)
    .select()
    .from(calendarFeeds)
    .where(
      and(
        eq(calendarFeeds.id, id),
        eq(calendarFeeds.workspaceId, s.workspaceId),
        eq(calendarFeeds.userId, s.userId)
      )
    )
    .get();
  if (!feed) throw error(404, 'not_found');
  return { s, feed };
}

/** `?action=sync` runs it now; `?action=preview` reports what 'all' would do. */
export const POST: RequestHandler = async ({ params, url, locals }) => {
  const { s, feed } = await own(locals, params.id);
  if (url.searchParams.get('action') === 'preview') {
    return json(await previewFeed(s, { ...feed, matchMode: 'all' }));
  }
  // Force a full read: a manual sync exists because something looks wrong, and
  // honouring the ETag would return "unchanged" and explain nothing.
  return json(await syncFeed(s, { ...feed, etag: null, lastModified: null }));
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const { s, feed } = await own(locals, params.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if ('label' in body) patch.label = body.label ? sanitizePlainText(String(body.label), 80) : null;
  if ('enabled' in body) patch.enabled = body.enabled ? 1 : 0;
  if ('matchMode' in body) patch.matchMode = body.matchMode === 'all' ? 'all' : 'known';
  // See intOr in $lib/server/calendar.ts for why this is not `||`.
  if ('windowPastDays' in body) patch.windowPastDays = intOr(body.windowPastDays, 90);
  if ('windowFutureDays' in body) patch.windowFutureDays = intOr(body.windowFutureDays, 0);
  if ('selfEmails' in body) {
    patch.selfEmails = JSON.stringify(
      Array.isArray(body.selfEmails) ? body.selfEmails.map(String).slice(0, 10) : []
    );
  }

  await db(s.region).update(calendarFeeds).set(patch).where(eq(calendarFeeds.id, feed.id));
  const next = await db(s.region)
    .select()
    .from(calendarFeeds)
    .where(eq(calendarFeeds.id, feed.id))
    .get();
  return json(next ? redactFeed(next) : { id: feed.id });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { s, feed } = await own(locals, params.id);
  await db(s.region).delete(calendarFeeds).where(eq(calendarFeeds.id, feed.id));
  return json({ id: feed.id, deleted: true });
};
