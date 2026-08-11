import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';
import { captureBody, type FormValues, type Parsed } from '../extension/src/capture-body';

/**
 * The extension's one write, pinned end to end.
 *
 * This file exists because of a bug it would have caught on day one: the popup
 * rendered an editable **Company** field, both the LinkedIn and GitHub adapters
 * filled it, and the request body never carried it. Nothing failed — the type
 * checker cannot see a key absent from an object literal, and the handler reads
 * `unknown` off the wire. Same reasoning as `create-returns-row.test.ts`, in the
 * opposite direction: a wire shape no compiler is watching needs a test.
 */

let ctx: TestDb;
let alice: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
}, 120_000);

afterAll(() => ctx?.cleanup());

const FORM: FormValues = {
  name: 'Ada Lovelace',
  role: 'Engineer',
  company: 'Analytical Engines',
  email: 'ada@example.com',
  phone: '+44 20 7946 0000',
  location: 'London',
  bio: 'Mathematician. Wrote the first algorithm.',
  industry: '',
  description: '',
  tags: 'mathematician, referred',
  note: 'Met at the Royal Society.'
};

const parsed = (over: Partial<Parsed> = {}): Parsed => ({
  kind: 'person',
  name: 'Ada Lovelace',
  url: 'https://www.linkedin.com/in/ada',
  adapter: 'linkedin',
  ...over
});

/** Exactly as the popup calls it — via a capture-scoped token, not a session. */
async function post(body: unknown) {
  const { POST } = await import('../src/routes/api/v1/capture/+server');
  return POST({
    request: new Request('http://localhost/api/v1/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { user: alice.user, sessionId: null, token: { id: 't', scopes: ['capture'] } }
  } as never);
}

describe('the popup ↔ /capture contract', () => {
  /**
   * The generalisable guard. A field added to the popup and forgotten on the
   * server is silent — the value simply never arrives. Asserting each key is
   * *read* catches the next one, not just the one that already shipped.
   */
  test('every key the popup sends is read by the handler', () => {
    const source = readFileSync('src/routes/api/v1/capture/+server.ts', 'utf8');
    for (const key of Object.keys(captureBody(parsed(), FORM))) {
      expect(source, `POST /capture never reads body.${key}`).toContain(`body.${key}`);
    }
  });

  test('a person capture lands every parsed field', async () => {
    const res = await post(captureBody(parsed(), FORM));
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; kind: string; dedup: boolean } };
    expect(data.kind).toBe('person');
    expect(data.dedup).toBe(false);

    const row = await ctx.client.execute({
      sql: `SELECT name, role, email, phone, location, notes, suggested_company_name,
                   company_id, source
              FROM people WHERE id = ?`,
      args: [data.id]
    });
    expect(row.rows[0]).toMatchObject({
      name: 'Ada Lovelace',
      role: 'Engineer',
      email: 'ada@example.com',
      phone: '+44 20 7946 0000',
      location: 'London',
      // The scraped employer is a *name*, so it lands as a suggestion for
      // `/people/[id]` to offer linking. It must not invent a company row.
      suggested_company_name: 'Analytical Engines',
      company_id: null,
      // Never 'parsing': the data arrived with the request, so the row must not
      // be handed to the boot janitor or shown with a spinner.
      source: null
    });
    // The bio becomes the person's notes — not their job title, which is where
    // the X and GitHub adapters used to put it.
    expect(String(row.rows[0].notes)).toContain('first algorithm');
  });

  test('the social links the page carried are stored, not dropped', async () => {
    const body = captureBody(parsed({ url: 'https://example.com/team/ada' }), FORM);
    const res = await post({
      ...body,
      linkedinUrl: 'https://www.linkedin.com/in/ada',
      xUrl: 'https://x.com/ada'
    });
    const { data } = (await res.json()) as { data: { id: string } };
    const row = await ctx.client.execute({
      sql: `SELECT linkedin_url, x_url FROM people WHERE id = ?`,
      args: [data.id]
    });
    expect(row.rows[0]).toMatchObject({
      linkedin_url: 'https://www.linkedin.com/in/ada',
      x_url: 'https://x.com/ada'
    });
  });

  test('the note becomes an interaction and the tags are attached', async () => {
    const res = await post(captureBody(parsed({ url: 'https://www.linkedin.com/in/ada2' }), FORM));
    const { data } = (await res.json()) as { data: { id: string; interactionId: string } };
    expect(data.interactionId).toBeTruthy();

    const note = await ctx.client.execute({
      sql: `SELECT body FROM interactions WHERE id = ?`,
      args: [data.interactionId]
    });
    expect(String(note.rows[0].body)).toContain('Royal Society');

    const tags = await ctx.client.execute({
      sql: `SELECT t.name FROM tags t
              JOIN person_tags pt ON pt.tag_id = t.id
             WHERE pt.person_id = ? ORDER BY t.name`,
      args: [data.id]
    });
    expect(tags.rows.map((r) => String(r.name))).toEqual(['mathematician', 'referred']);
  });

  test('a company capture keeps its description and industry', async () => {
    const body = captureBody(parsed({ kind: 'company', url: 'https://stripe.com' }), {
      ...FORM,
      name: 'Stripe',
      industry: 'Payments',
      description: 'Financial infrastructure for the internet.'
    });
    const res = await post(body);
    const { data } = (await res.json()) as { data: { id: string; kind: string } };
    expect(data.kind).toBe('company');

    const row = await ctx.client.execute({
      sql: `SELECT name, industry, description FROM companies WHERE id = ?`,
      args: [data.id]
    });
    expect(row.rows[0].name).toBe('Stripe');
    expect(row.rows[0].industry).toBe('Payments');
    expect(String(row.rows[0].description)).toContain('Financial infrastructure');
  });

  /**
   * A description is whatever `og:description` said, i.e. markup controlled by
   * whoever owns the page you were looking at. `notes` is rendered with
   * `{@html}`, so the manual-with-url branch of savePerson/saveCompany storing
   * either raw was a stored-XSS path with an authenticated `write` call.
   */
  test('scraped markup is sanitized on the way in', async () => {
    const res = await post(
      captureBody(parsed({ kind: 'company', url: 'https://evil.example' }), {
        ...FORM,
        name: 'Evil Corp',
        description: 'Hello <img src=x onerror="alert(1)"> world<script>alert(2)</script>'
      })
    );
    const { data } = (await res.json()) as { data: { id: string } };
    const row = await ctx.client.execute({
      sql: `SELECT description FROM companies WHERE id = ?`,
      args: [data.id]
    });
    const stored = String(row.rows[0].description);
    expect(stored).not.toContain('onerror');
    expect(stored).not.toContain('<script');
    expect(stored).toContain('world');
  });

  test('...including person notes, which is the branch that reaches {@html}', async () => {
    // Not a capture body — `/capture` never sends notes. This is the same
    // savePerson branch, reached by `POST /api/v1/people` with a url, and it is
    // the one that feeds NotesEditor's `{@html value}`.
    const { savePerson } = await import('../src/lib/server/savePerson');
    const { id } = await savePerson(alice.scope, 'https://example.com/team/mallory', {
      name: 'Mallory',
      notes: '<p>Hi</p><img src=x onerror="alert(1)">'
    });
    const row = await ctx.client.execute({
      sql: `SELECT notes FROM people WHERE id = ?`,
      args: [id]
    });
    expect(String(row.rows[0].notes)).not.toContain('onerror');
    expect(String(row.rows[0].notes)).toContain('<p>Hi</p>');
  });

  /**
   * `updated_at === created_at` means "no human has touched this" elsewhere in
   * the app; here the rule is narrower but the same in spirit — a re-capture
   * fills blanks and accepts corrections, and a field the user left empty must
   * not wipe what is already on the record.
   */
  test('a re-capture dedups and does not blank fields left empty', async () => {
    const url = 'https://www.linkedin.com/in/ada3';
    const first = await post(captureBody(parsed({ url }), FORM));
    const { data: a } = (await first.json()) as { data: { id: string } };

    const second = await post(
      captureBody(parsed({ url }), { ...FORM, role: '', company: '', email: 'ada@new.example' })
    );
    expect(second.status).toBe(200);
    const { data: b } = (await second.json()) as { data: { id: string; dedup: boolean } };
    expect(b.id).toBe(a.id);
    expect(b.dedup).toBe(true);

    const row = await ctx.client.execute({
      sql: `SELECT role, email, suggested_company_name FROM people WHERE id = ?`,
      args: [a.id]
    });
    expect(row.rows[0]).toMatchObject({
      role: 'Engineer', // left empty on the second pass, so preserved
      suggested_company_name: 'Analytical Engines',
      email: 'ada@new.example' // supplied, so accepted
    });
  });

  test('a capture-scoped token is enough — no read scope required', async () => {
    // The documented setup path. Before `requireApiScope` learned about the
    // extension's three reads this threw 403 at the options page instead.
    const { GET: me } = await import('../src/routes/api/v1/me/+server');
    const { GET: lookup } = await import('../src/routes/api/v1/lookup/+server');
    const { GET: tags } = await import('../src/routes/api/v1/tags/+server');
    const locals = {
      user: alice.user,
      sessionId: null,
      token: { id: 't', scopes: ['capture'] }
    };

    expect((await me({ locals } as never)).status).toBe(200);
    expect(
      (
        await lookup({
          url: new URL('http://localhost/api/v1/lookup?url=https://www.linkedin.com/in/ada'),
          locals
        } as never)
      ).status
    ).toBe(200);
    expect(
      (await tags({ url: new URL('http://localhost/api/v1/tags?scope=person'), locals } as never))
        .status
    ).toBe(200);
  });
});
