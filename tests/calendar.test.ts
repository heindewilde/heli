import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Calendar ingestion, with the network stubbed.
 *
 * The properties worth pinning are the ones that destroy data if they flip: a
 * re-sync must not duplicate, must not overwrite a human's edit, and a
 * cancellation must not silently delete something someone wrote in.
 */

let ctx: TestDb;
let alice: Tenant;

const ICS = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');

const VEVENT = (opts: {
  uid: string;
  summary?: string;
  start?: string;
  attendees?: string[];
  cancelled?: boolean;
  rrule?: string;
}) =>
  [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `SUMMARY:${opts.summary ?? 'Meeting'}`,
    `DTSTART:${opts.start ?? isoStamp(Date.now() - 86_400_000)}`,
    ...(opts.attendees ?? []).map((e) => `ATTENDEE:mailto:${e}`),
    ...(opts.cancelled ? ['STATUS:CANCELLED'] : []),
    ...(opts.rrule ? [`RRULE:${opts.rrule}`] : []),
    'END:VEVENT'
  ].join('\r\n');

function isoStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Stub the network at the fetch boundary the guard uses. */
function serve(body: string, init: { status?: number; etag?: string } = {}) {
  vi.stubGlobal('fetch', async () =>
    new Response(init.status === 304 ? null : body, {
      status: init.status ?? 200,
      headers: init.etag ? { etag: init.etag } : {}
    })
  );
}

let feedId: string;

async function makeFeed(overrides: Record<string, unknown> = {}) {
  const { db } = await import('../src/lib/server/db');
  const { calendarFeeds } = await import('../src/lib/server/schema');
  const { createId } = await import('@paralleldrive/cuid2');
  const now = Date.now();
  feedId = createId();
  await db(alice.scope.region).insert(calendarFeeds).values({
    id: feedId,
    workspaceId: alice.scope.workspaceId,
    userId: alice.user.id,
    // A public host, so assertPublicUrl passes without a DNS lookup.
    url: 'https://93.184.216.34/basic.ics',
    label: 'Work',
    enabled: 1,
    matchMode: 'known',
    windowPastDays: 90,
    windowFutureDays: 30,
    createdAt: now,
    updatedAt: now,
    ...overrides
  });
  const row = await db(alice.scope.region)
    .select()
    .from(calendarFeeds)
    .where(eq(calendarFeeds.id, feedId))
    .get();
  return row!;
}

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
}, 120_000);

afterAll(() => {
  ctx?.cleanup();
  vi.unstubAllGlobals();
});

async function countInteractions(): Promise<number> {
  const r = await ctx.client.execute(`SELECT COUNT(*) AS n FROM interactions`);
  return Number(r.rows[0].n);
}

describe('sync', () => {
  test('imports events, and a second sync changes nothing', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'a', summary: 'Kickoff' }), VEVENT({ uid: 'b', summary: 'Review' })));

    const first = await syncFeed(alice.scope, feed);
    expect(first.status).toBe('ok');
    expect(first.created).toBe(2);
    expect(await countInteractions()).toBe(2);

    // Idempotency is the whole point of the external_id key.
    const second = await syncFeed(alice.scope, { ...feed, etag: null, lastModified: null });
    expect(second.created).toBe(0);
    expect(await countInteractions()).toBe(2);
  });

  test('links attendees that already exist as people', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const { savePerson } = await import('../src/lib/server/savePerson');
    await savePerson(alice.scope, null, { name: 'Grace Hopper', email: 'grace@example.com' });

    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'linked', attendees: ['grace@example.com', 'stranger@example.com'] })));
    await syncFeed(alice.scope, feed);

    const rows = await ctx.client.execute(`
      SELECT p.name FROM interaction_people ip
      JOIN people p ON p.id = ip.person_id
      JOIN interactions i ON i.id = ip.interaction_id
      WHERE i.external_id IS NOT NULL
    `);
    const names = rows.rows.map((r) => String(r.name));
    expect(names).toContain('Grace Hopper');
    // match_mode 'known' must not invent anyone.
    expect(names).not.toContain('stranger');
  });

  test("match_mode 'all' creates the unknown attendees", async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed({ matchMode: 'all' });
    serve(ICS(VEVENT({ uid: 'creates', attendees: ['newperson@example.com'] })));

    const res = await syncFeed(alice.scope, feed);
    expect(res.peopleCreated).toBe(1);
    const rows = await ctx.client.execute({
      sql: `SELECT name FROM people WHERE email = ?`,
      args: ['newperson@example.com']
    });
    expect(rows.rows).toHaveLength(1);
  });

  test('a human edit survives a re-sync', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'edited', summary: 'Original' })));
    await syncFeed(alice.scope, feed);

    // Simulate someone editing it in the app: updated_at moves past created_at,
    // which is the marker the sync reads.
    await ctx.client.execute({
      sql: `UPDATE interactions SET title = ?, updated_at = created_at + 1000 WHERE external_id IS NOT NULL AND title = ?`,
      args: ['My own notes', 'Original']
    });

    serve(ICS(VEVENT({ uid: 'edited', summary: 'Renamed upstream' })));
    await syncFeed(alice.scope, { ...feed, etag: null, lastModified: null });

    const rows = await ctx.client.execute({
      sql: `SELECT title FROM interactions WHERE title IN (?, ?)`,
      args: ['My own notes', 'Renamed upstream']
    });
    expect(rows.rows.map((r) => String(r.title))).toEqual(['My own notes']);
  });

  test('an untouched event does follow upstream renames', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'renamed', summary: 'Before' })));
    await syncFeed(alice.scope, feed);

    serve(ICS(VEVENT({ uid: 'renamed', summary: 'After' })));
    const res = await syncFeed(alice.scope, { ...feed, etag: null, lastModified: null });
    expect(res.updated).toBe(1);

    const rows = await ctx.client.execute({
      sql: `SELECT title FROM interactions WHERE title = ?`,
      args: ['After']
    });
    expect(rows.rows).toHaveLength(1);
  });

  test('cancellation deletes an untouched row but never an edited one', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'gone', summary: 'Untouched' }), VEVENT({ uid: 'kept', summary: 'Edited' })));
    await syncFeed(alice.scope, feed);

    await ctx.client.execute({
      sql: `UPDATE interactions SET updated_at = created_at + 1000 WHERE title = ?`,
      args: ['Edited']
    });

    serve(
      ICS(
        VEVENT({ uid: 'gone', summary: 'Untouched', cancelled: true }),
        VEVENT({ uid: 'kept', summary: 'Edited', cancelled: true })
      )
    );
    await syncFeed(alice.scope, { ...feed, etag: null, lastModified: null });

    const titles = (await ctx.client.execute(`SELECT title FROM interactions`)).rows.map((r) =>
      String(r.title)
    );
    expect(titles).not.toContain('Untouched');
    // Destroying someone's notes because an organiser cancelled a meeting would
    // be unrecoverable, so it is marked instead.
    expect(titles).toContain('Edited (cancelled)');
  });

  test('recurring events are skipped and reported', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve(ICS(VEVENT({ uid: 'weekly', rrule: 'FREQ=WEEKLY' }), VEVENT({ uid: 'single' })));
    const res = await syncFeed(alice.scope, feed);
    expect(res.skippedRecurring).toBe(1);
    expect(res.created).toBe(1);
  });

  test('a 304 is cheap and touches nothing', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed({ etag: 'W/"abc"' });
    serve('', { status: 304 });
    const before = await countInteractions();
    const res = await syncFeed(alice.scope, feed);
    expect(res.status).toBe('unchanged');
    expect(await countInteractions()).toBe(before);
  });

  test('a non-calendar response is rejected rather than parsed as empty', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    serve('<!doctype html><title>Login</title>');
    const res = await syncFeed(alice.scope, feed);
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/did not return a calendar/i);
  });

  test('events outside the window are ignored', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed({ windowPastDays: 1, windowFutureDays: 0 });
    serve(ICS(VEVENT({ uid: 'ancient', start: isoStamp(Date.now() - 400 * 86_400_000) })));
    const res = await syncFeed(alice.scope, feed);
    expect(res.created).toBe(0);
  });

  test('the feed URL is never returned to a client', async () => {
    const { redactFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed();
    const safe = redactFeed(feed) as Record<string, unknown>;
    expect(safe.url).toBeUndefined();
    expect(safe.selfEmails).toBeUndefined();
    expect(String(safe.urlHint)).toContain('93.184.216.34');
    expect(JSON.stringify(safe)).not.toContain('basic.ics');
  });
});

describe('SSRF', () => {
  test('a feed pointed at cloud metadata is refused', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed({ url: 'http://169.254.169.254/latest/meta-data/' });
    serve(ICS(VEVENT({ uid: 'x' })));
    const res = await syncFeed(alice.scope, feed);
    expect(res.status).toBe('error');
    expect(res.error).toMatch(/private address/i);
  });

  test('localhost is refused too', async () => {
    const { syncFeed } = await import('../src/lib/server/calendar');
    const feed = await makeFeed({ url: 'http://localhost:8080/cal.ics' });
    const res = await syncFeed(alice.scope, feed);
    expect(res.status).toBe('error');
  });
});
