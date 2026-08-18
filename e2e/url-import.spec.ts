import { test, expect, visit } from './fixtures';

/**
 * Paste → review → commit, driven the way a person does it. The parsing itself
 * is pinned in `tests/url-extract.test.ts`; what this covers is the part no
 * server-side test can reach — that the dialog, the review table and the
 * per-row kind override actually work in a browser.
 */

const PASTE = [
  'Notes from the week. Saw https://github.com/rich-harris',
  'and sveltesociety.dev is worth a look, i.e. nothing else.',
  'Name,Profile',
  'Ada,https://www.linkedin.com/in/ada-lovelace/?trk=x',
  'vercel.com, https://svelte.dev/docs.'
].join('\n');

test('a messy paste reaches review correctly classified', async ({ app }) => {
  await visit(app, '/people');
  await app.getByRole('button', { name: 'Import links' }).click();

  await app.getByRole('dialog').getByRole('textbox').fill(PASTE);
  await app.getByRole('button', { name: 'Review links' }).click();

  await expect(app.getByRole('heading', { name: 'Review links' })).toBeVisible();
  const rows = app.locator('ul[role=list] > li');
  await expect(rows).toHaveCount(4);
  await expect(app.getByRole('link', { name: 'https://github.com/rich-harris' })).toBeVisible();
  // A bare host alone in a CSV cell is promoted to https…
  await expect(app.getByRole('link', { name: 'https://vercel.com/' })).toBeVisible();
  // …and the trailing full stop is not part of the link.
  await expect(app.getByRole('link', { name: 'https://svelte.dev/docs' })).toBeVisible();

  /**
   * `sveltesociety.dev` sits mid-sentence, and is deliberately *not* taken.
   * The bare-host rule is anchored to a whole line or cell for exactly this
   * reason — unanchored, "i.e." in the next clause becomes a record too.
   */
  await expect(app.getByRole('link', { name: /sveltesociety/ })).toHaveCount(0);
  await expect(app.getByText(/i\.e\./)).toHaveCount(0);

  // A GitHub user is a person; a bare domain is a company.
  // `Select` renders a real button, not a native combobox — see its header.
  await expect(rows.filter({ hasText: 'rich-harris' }).getByRole('button')).toHaveText(/Person/);
  await expect(rows.filter({ hasText: 'vercel.com' }).getByRole('button')).toHaveText(/Company/);

  // LinkedIn never enriches, and the screen says so rather than looking broken.
  await expect(app.getByText(/LinkedIn profiles/)).toBeVisible();
});

test('a kind override is honoured by the commit', async ({ app }) => {
  await visit(app, '/people');
  await app.getByRole('button', { name: 'Import links' }).click();
  await app.getByRole('dialog').getByRole('textbox').fill('https://vercel.com\nhttps://github.com/torvalds');
  await app.getByRole('button', { name: 'Review links' }).click();

  const rows = app.locator('ul[role=list] > li');
  const vercel = rows.filter({ hasText: 'vercel.com' });
  await expect(vercel.getByRole('button')).toHaveText(/Company/);

  // Flip it, then import.
  await vercel.getByRole('button').click();
  await app.getByRole('option', { name: 'Person', exact: true }).click();
  await expect(vercel.getByRole('button')).toHaveText(/Person/);

  await app.getByRole('button', { name: /^Import 2$/ }).click();
  await expect(app.getByText('Added 2 records.')).toBeVisible();

  // The override stuck: vercel.com is a person now.
  await visit(app, '/people');
  await expect(app.getByRole('link', { name: /vercel|Vercel/ }).first()).toBeVisible();
});

test('discarding a staged paste returns you to the list', async ({ app }) => {
  await visit(app, '/companies');
  await app.getByRole('button', { name: 'Import links' }).click();
  await app.getByRole('dialog').getByRole('textbox').fill('https://example.com');
  await app.getByRole('button', { name: 'Review links' }).click();
  await expect(app.getByRole('heading', { name: 'Review links' })).toBeVisible();

  await app.getByRole('button', { name: 'Discard' }).click();
  await expect(app).toHaveURL(/\/companies$/);
});
