import { test, expect, rowBoxes, bulkBar, visit, memberSessionId } from './fixtures';

/**
 * Export, driven the way a person does it.
 *
 * The header link and the selection button take deliberately different routes —
 * a plain `<a href>` for the filtered view, a POST plus an object URL for a
 * selection that can outgrow a URL — and only a browser can tell whether either
 * actually produces a file. The CSV *content* is pinned server-side in
 * `tests/export.test.ts`; what is covered here is that the click works and that
 * the link carries the filters the page is showing.
 */

async function csvFrom(app: Parameters<typeof visit>[0], click: () => Promise<void>) {
  const [download] = await Promise.all([app.waitForEvent('download'), click()]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { name: download.suggestedFilename(), body: Buffer.concat(chunks).toString('utf8') };
}

test('the panel previews the scope before anything is downloaded', async ({ app }) => {
  await visit(app, '/people');

  // The trigger says only "Export" — naming the scope is the panel's job, so
  // that a narrowed view cannot hand over a short file without saying so.
  await app.getByRole('button', { name: 'Export', exact: true }).click();
  const panel = app.getByRole('dialog', { name: 'Export' });
  await expect(panel).toContainText('Archived excluded');
  await expect(panel.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
    'href',
    /kind=people/
  );
  // The count is real, not a placeholder.
  await expect(panel).toContainText(/\d+ (person|people)/);
  await app.keyboard.press('Escape');

  await app.getByRole('link', { name: /Favorites/i }).first().click();
  await app.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(panel).toContainText('Favourites only');
  await expect(panel.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
    'href',
    /favorite=1/
  );
});

test('the panel downloads a CSV of the current view', async ({ app }) => {
  await visit(app, '/people');

  await app.getByRole('button', { name: 'Export', exact: true }).click();
  const { name, body } = await csvFrom(app, () =>
    app.getByRole('link', { name: 'Download CSV' }).click()
  );

  expect(name).toMatch(/^heli-people-\d{4}-\d{2}-\d{2}\.csv$/);
  // The header row is the file format, so it is worth asserting from this end
  // too — this is the only test that sees what actually reaches the disk.
  expect(body.split('\r\n')[0].replace(/^﻿/, '')).toBe(
    'id,name,url,domain,handle,role,company_id,email,phone,location,avatar_url,notes,tags,is_favorite,is_archived,created_at,updated_at'
  );
});

test('exporting a selection downloads exactly the ticked rows', async ({ app }) => {
  await visit(app, '/people');

  const boxes = rowBoxes(app);
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await expect(bulkBar(app)).toContainText('2 people selected');

  const { name, body } = await csvFrom(app, () =>
    bulkBar(app).getByRole('button', { name: 'Export' }).click()
  );

  expect(name).toMatch(/^heli-people-\d{4}-\d{2}-\d{2}\.csv$/);
  // Header plus exactly two rows. A trailing CRLF leaves one empty entry.
  const lines = body.trim().split('\r\n');
  expect(lines).toHaveLength(3);

  // And the selection survives: an export changes nothing, so clearing it would
  // make a second action impossible for no reason.
  await expect(bulkBar(app)).toContainText('2 people selected');
});

test('a collection exports both kinds into one file', async ({ app }) => {
  // Its own collection, not the shared seed: another spec removes a member from
  // that one, so depending on it makes this test pass or fail on spec order.
  const made = await app.request.post('/api/collections', { data: { name: 'Mixed members' } });
  const { id } = (await made.json()) as { id: string };

  const person = await (await app.request.get('/api/people?limit=1')).json();
  const company = await (await app.request.get('/api/companies?limit=1')).json();
  for (const [kind, refId] of [
    ['person', person.items[0].id],
    ['company', company.items[0].id]
  ] as const) {
    await app.request.post(`/api/collections/${id}/items`, { data: { kind, refId } });
  }

  await visit(app, `/collections/${id}`);

  await app.getByRole('button', { name: 'Export', exact: true }).click();
  const { body } = await csvFrom(app, () =>
    app.getByRole('link', { name: 'Download CSV' }).click()
  );

  const [header, ...rows] = body.trim().split('\r\n');
  expect(header.replace(/^﻿/, '').split(',')[0]).toBe('kind');
  // The whole point of the merged file: a person and a company in one table.
  expect(rows.some((r) => r.startsWith('person,'))).toBe(true);
  expect(rows.some((r) => r.startsWith('company,'))).toBe(true);
});

/**
 * The Settings links were broken for as long as they existed: no
 * `data-sveltekit-reload`, so the client router turned the click into a thrown
 * "Not found: /api/export" and nothing downloaded. Nothing caught it, because
 * the only symptom is in a built app and the fixture's console-error check
 * needs someone to actually click.
 */
test('the Settings export links download, and carry archived records', async ({ app }) => {
  await visit(app, '/settings');

  const link = app.getByRole('link', { name: /^People \(/ });
  // Absent this param the shared filter parser would hide archived rows, and a
  // workspace-wide export would quietly stop being workspace-wide.
  await expect(link).toHaveAttribute('href', /archived=1/);

  const { name } = await csvFrom(app, () => link.click());
  expect(name).toMatch(/^heli-people-\d{4}-\d{2}-\d{2}\.csv$/);
});

/**
 * Adding a record used to *replace* the whole button cluster with a bare input:
 * the primary button vanished as you reached for it, Export and Import went
 * with it, and the only way to commit was an Enter key nothing mentioned.
 */
test('adding a person leaves the other buttons in place', async ({ app }) => {
  await visit(app, '/people');

  await app.getByRole('button', { name: 'Add person' }).click();

  // The cluster is intact behind the panel.
  await expect(app.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  await expect(app.getByRole('button', { name: 'Import', exact: true })).toBeVisible();

  const panel = app.getByRole('dialog', { name: 'Add person' });
  // trapFocus puts the caret in the field, so it can be typed into straight away.
  await app.keyboard.type('Ida Rhodes');
  await expect(panel.getByRole('textbox')).toHaveValue('Ida Rhodes');

  // A real submit button, not a hidden Enter binding.
  await panel.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(app.getByRole('link', { name: 'Ida Rhodes' })).toBeVisible();
  await expect(panel).toHaveCount(0);

  // Specs share one seeded database and run in file order, so a spec that adds
  // a row has to take it back out again — `selection.spec.ts` counts the rows
  // on /people and runs after this one.
  const found = await (await app.request.get('/api/people?q=Rhodes')).json();
  for (const p of found.items as { id: string }[]) {
    await app.request.delete(`/api/people/${p.id}`);
  }
});

/**
 * The role change, asserted from the outside.
 *
 * `/api/export` used to be owner/admin only. That gate lived in the route, and
 * the server-side suite calls helpers rather than routes — so nothing in the
 * repo could see the rule either before or after. This is the only test that
 * covers who may export, which makes it the one guarding the behaviour change
 * that actually ships.
 */
test('a plain member can export, and sees the Settings section', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: 'heli_session',
      value: memberSessionId(),
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax'
    }
  ]);

  const res = await ctx.request.get('http://127.0.0.1:4183/api/export?kind=people');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');

  // The selection export is a POST, and it is in MEMBER_ALLOWED for that reason.
  const posted = await ctx.request.post('http://127.0.0.1:4183/api/export', {
    data: { kind: 'people', ids: ['nope'] }
  });
  expect(posted.status()).toBe(200);

  // And the /time report's CSV link, which 403'd for members for as long as it
  // had been on screen.
  const time = await ctx.request.get('http://127.0.0.1:4183/api/export?kind=time');
  expect(time.status()).toBe(200);

  // Settings no longer hides the section behind an admin check.
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4183/settings');
  await expect(page.getByRole('link', { name: /^People \(/ })).toBeVisible();

  await ctx.close();
});
