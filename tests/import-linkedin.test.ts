import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Staging and committing a LinkedIn connections import.
 *
 * The property worth pinning is the URL. An imported connection and a later
 * browser capture of the same profile have to be *one* person: the extension
 * resolves identity through `/api/v1/lookup`, which matches the unique
 * (workspace_id, url). The commit path originally dropped the URL entirely, so
 * importing 800 connections and then capturing one of them produced a duplicate.
 */

let ctx: TestDb;
let alice: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
}, 120_000);

afterAll(() => ctx?.cleanup());

const CSV = [
  '"Notes:"',
  '"Some connections have no email address."',
  '',
  '',
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Ada,Lovelace,https://www.linkedin.com/in/ada?trk=nav,ada@example.com,Analytical Engines,Engineer,04 Mar 2019',
  'Grace,Hopper,https://www.linkedin.com/in/grace,,US Navy,Rear Admiral,01 Jan 2020'
].join('\r\n');

const locals = () => ({ user: alice.user, sessionId: 's', token: null });

/** Cookie jar thin enough to satisfy the two handlers. */
function jar() {
  const store = new Map<string, string>();
  return {
    store,
    cookies: {
      get: (k: string) => store.get(k),
      set: (k: string, v: string) => store.set(k, v),
      delete: (k: string) => store.delete(k)
    }
  };
}

async function stage(csv: string, cookies: ReturnType<typeof jar>['cookies']) {
  const { POST } = await import('../src/routes/api/import/linkedin/+server');
  return POST({
    request: new Request('http://localhost/api/import/linkedin', {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: csv
    }),
    cookies,
    locals: locals()
  } as never);
}

/** `include` omitted is the no-selection case: commit everything staged. */
async function commit(cookies: ReturnType<typeof jar>['cookies'], include?: number[]) {
  const { POST } = await import('../src/routes/api/import/+server');
  const request = new Request('http://localhost/api/import', {
    method: 'POST',
    ...(include
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ include }) }
      : {})
  });
  return POST({ request, cookies, locals: locals() } as never);
}

describe('the LinkedIn connections import', () => {
  test('stages, then commits with the URL normalised and the company suggested', async () => {
    const j = jar();
    const staged = (await (await stage(CSV, j.cookies)).json()) as {
      staged: number;
      duplicates: number;
      skipped: number;
    };
    expect(staged).toEqual({ staged: 2, duplicates: 0, skipped: 0 });

    const done = (await (await commit(j.cookies)).json()) as { imported: number; errors: number };
    expect(done.imported).toBe(2);
    expect(done.errors).toBe(0);

    const rows = await ctx.client.execute({
      sql: `SELECT name, url, domain, handle, role, suggested_company_name, email, notes, source
              FROM people ORDER BY name`,
      args: []
    });
    expect(rows.rows[0]).toMatchObject({
      name: 'Ada Lovelace',
      // `?trk=nav` is a LinkedIn tracking param; cleanUrl strips it, so this is
      // the same string a capture from the browser would produce.
      url: 'https://www.linkedin.com/in/ada',
      domain: 'linkedin.com',
      handle: 'ada',
      role: 'Engineer',
      suggested_company_name: 'Analytical Engines',
      email: 'ada@example.com',
      source: 'linkedin_csv'
    });
    expect(String(rows.rows[0].notes)).toContain('04 Mar 2019');
    // The common case: no email, still imported.
    expect(rows.rows[1]).toMatchObject({ name: 'Grace Hopper', email: null });
  });

  test('an imported connection and a later capture are the same person', async () => {
    // The whole point of carrying the URL through the import.
    const { POST } = await import('../src/routes/api/v1/capture/+server');
    const res = await POST({
      request: new Request('http://localhost/api/v1/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.linkedin.com/in/ada',
          kind: 'person',
          name: 'Ada Lovelace',
          location: 'London'
        })
      }),
      locals: { user: alice.user, sessionId: null, token: { id: 't', scopes: ['capture'] } }
    } as never);

    expect(res.status).toBe(200); // 200, not 201 — deduped onto the imported row
    const { data } = (await res.json()) as { data: { dedup: boolean } };
    expect(data.dedup).toBe(true);

    const count = await ctx.client.execute({
      sql: `SELECT COUNT(*) AS n FROM people WHERE url = ?`,
      args: ['https://www.linkedin.com/in/ada']
    });
    expect(Number(count.rows[0].n)).toBe(1);
  });

  test('re-uploading the same export stages nothing new', async () => {
    const j = jar();
    const again = (await (await stage(CSV, j.cookies)).json()) as {
      staged: number;
      duplicates: number;
    };
    expect(again).toEqual({ staged: 0, duplicates: 2, skipped: 0 });
  });

  test('a file the export never produced is refused, not half-imported', async () => {
    const j = jar();
    await expect(stage('Name,Email\r\nAda,ada@example.com', j.cookies)).rejects.toMatchObject({
      status: 422
    });
    expect(j.store.size).toBe(0);
  });

  test('duplicates inside one file are collapsed', async () => {
    // Users merge an old export with a new one; the file itself then repeats.
    const dupes = [
      'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      'Alan,Turing,https://www.linkedin.com/in/alan,,NPL,Scientist,01 Jan 1946',
      'Alan,Turing,https://www.linkedin.com/in/alan,,NPL,Scientist,01 Jan 1946'
    ].join('\r\n');
    const j = jar();
    const staged = (await (await stage(dupes, j.cookies)).json()) as {
      staged: number;
      duplicates: number;
    };
    expect(staged).toEqual({ staged: 1, duplicates: 1, skipped: 0 });
  });

  /**
   * The review screen sends indices into the staged list, never rows — so the
   * commit still writes only data the server parsed itself. What is worth
   * pinning is that the subset is honoured exactly, and that a bad selection
   * costs a click rather than the whole upload.
   */
  test('only the selected rows are committed, and the rest are counted', async () => {
    const csv = [
      'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      'Ida,Rhodes,https://www.linkedin.com/in/ida,,IBM,Programmer,03 Feb 2021',
      'Karen,Sparck Jones,https://www.linkedin.com/in/karen,k@example.com,Cambridge,Professor,09 Sep 2022',
      'Barbara,Liskov,https://www.linkedin.com/in/barbara,,MIT,Professor,15 Jun 2023'
    ].join('\r\n');
    const j = jar();
    await stage(csv, j.cookies);

    const done = (await (await commit(j.cookies, [1, 2])).json()) as {
      imported: number;
      errors: number;
      deselected: number;
    };
    expect(done).toMatchObject({ imported: 2, errors: 0, deselected: 1 });

    const rows = await ctx.client.execute({
      sql: `SELECT name FROM people WHERE handle IN ('ida', 'karen', 'barbara') ORDER BY name`,
      args: []
    });
    // Ida was index 0 and was left out: not written, not half-written.
    expect(rows.rows.map((r) => r.name)).toEqual(['Barbara Liskov', 'Karen Sparck Jones']);
  });

  test('an empty selection is refused without destroying the staged import', async () => {
    const csv = [
      'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      'Frances,Allen,https://www.linkedin.com/in/frances,,IBM,Fellow,01 Jan 2020',
      'Adele,Goldberg,https://www.linkedin.com/in/adele,,Xerox,Researcher,02 Feb 2021'
    ].join('\r\n');
    const j = jar();
    await stage(csv, j.cookies);

    // Deselecting everything is a mis-click, not an instruction to throw away
    // ten minutes of triage.
    await expect(commit(j.cookies, [])).rejects.toMatchObject({ status: 400 });

    // Indices outside the staged list are ignored rather than fatal — same
    // reasoning: the user still gets the import they asked for.
    const done = (await (await commit(j.cookies, [0, 99, -1])).json()) as {
      imported: number;
      deselected: number;
    };
    expect(done).toMatchObject({ imported: 1, deselected: 1 });

    const rows = await ctx.client.execute({
      sql: `SELECT name FROM people WHERE handle IN ('frances', 'adele')`,
      args: []
    });
    expect(rows.rows.map((r) => r.name)).toEqual(['Frances Allen']);
  });

  test('a member cannot commit an import: it is an unbounded bulk insert', async () => {
    const bob = await makeTenant('bob');
    const j = jar();
    await expect(
      (async () => {
        const { POST } = await import('../src/routes/api/import/linkedin/+server');
        return POST({
          request: new Request('http://localhost/api/import/linkedin', {
            method: 'POST',
            headers: { 'content-type': 'text/csv' },
            body: CSV
          }),
          cookies: j.cookies,
          locals: { user: { ...bob.user, role: 'member' }, sessionId: 's', token: null }
        } as never);
      })()
    ).rejects.toMatchObject({ status: 403 });
  });
});
