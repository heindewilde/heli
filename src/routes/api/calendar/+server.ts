import { json, error } from '@sveltejs/kit';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { db } from '$lib/server/db';
import { calendarFeeds } from '$lib/server/schema';
import { listFeeds, redactFeed } from '$lib/server/calendar';
import { assertPublicUrl, cleanUrl, UrlError } from '$lib/server/url';
import { sanitizePlainText } from '$lib/server/sanitize';

export const GET: RequestHandler = async ({ locals }) => {
  const s = requireScope(locals);
  return json({ items: (await listFeeds(s)).map(redactFeed) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }

  let url: string;
  try {
    url = cleanUrl(String(body.url ?? ''));
    // Same guard the sync uses, applied at subscribe time so a bad URL fails
    // in front of the person who typed it rather than silently in a job.
    await assertPublicUrl(url);
  } catch (err) {
    throw error(400, err instanceof UrlError ? err.code : 'invalid_url');
  }

  const now = Date.now();
  const id = createId();
  await db(s.region).insert(calendarFeeds).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    url,
    label: body.label ? sanitizePlainText(String(body.label), 80) : null,
    enabled: 1,
    selfEmails: JSON.stringify(
      Array.isArray(body.selfEmails) ? body.selfEmails.map(String).slice(0, 10) : []
    ),
    matchMode: body.matchMode === 'all' ? 'all' : 'known',
    windowPastDays: Number(body.windowPastDays) || 90,
    windowFutureDays: Number(body.windowFutureDays) || 30,
    createdAt: now,
    updatedAt: now
  });

  const created = await db(s.region)
    .select()
    .from(calendarFeeds)
    .where(eq(calendarFeeds.id, id))
    .get();
  return json(created ? redactFeed(created) : { id }, { status: 201 });
};
