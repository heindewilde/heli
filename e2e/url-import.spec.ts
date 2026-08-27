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
  await app.getByRole('button', { name: 'Import', exact: true }).click();

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
  await app.getByRole('button', { name: 'Import', exact: true }).click();
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
  await app.getByRole('button', { name: 'Import', exact: true }).click();
  await app.getByRole('dialog').getByRole('textbox').fill('https://example.com');
  await app.getByRole('button', { name: 'Review links' }).click();
  await expect(app.getByRole('heading', { name: 'Review links' })).toBeVisible();

  await app.getByRole('button', { name: 'Discard' }).click();
  await expect(app).toHaveURL(/\/companies$/);
});

/**
 * Pasting links into a collection.
 *
 * The case worth driving in a browser is the *duplicate*: a link you already
 * have must not be re-created, but it must still be selectable and must still
 * land in the collection. Server-side that is `tests/url-import-collection.ts`;
 * what only a browser sees is that the review screen actually offers the row
 * instead of greying it out, which is how it behaves everywhere else.
 */
test('a collection paste files links you already have, without duplicating them', async ({
  app
}) => {
  const made = await app.request.post('/api/collections', { data: { name: 'Import target' } });
  const { id } = (await made.json()) as { id: string };

  // A record that exists before the paste, so the same URL is a duplicate.
  // Via /api/save, because that is the one entry point that stores a URL —
  // POST /api/companies takes a name and never sets `url`, which is what the
  // staging dedupe matches on.
  const saved = await app.request.post('/api/save', { data: { url: 'https://stripe.com' } });
  expect(saved.ok()).toBe(true);

  await visit(app, `/collections/${id}`);
  await app.getByRole('button', { name: 'Import', exact: true }).click();
  await app
    .getByRole('dialog')
    .getByRole('textbox')
    .fill('https://stripe.com\nhttps://linear.app');
  await app.getByRole('button', { name: 'Review links' }).click();

  await expect(app.getByRole('heading', { name: 'Review links' })).toBeVisible();
  await expect(app.getByText(/Importing into/)).toContainText('Import target');

  // The duplicate is shown, says what will happen to it, and is ticked.
  const rows = app.locator('ul[role=list] > li');
  const dupe = rows.filter({ hasText: 'stripe.com' });
  await expect(dupe).toContainText('will be added to Import target');
  await expect(dupe.getByRole('checkbox')).toBeChecked();
  await expect(dupe.getByRole('checkbox')).toBeEnabled();

  await app.getByRole('button', { name: /^Import 2$/ }).click();
  await expect(app.getByText(/now in Import target/)).toBeVisible();

  // Both are members; the pre-existing company was not duplicated.
  await app.getByRole('link', { name: 'Back to the list' }).click();
  await expect(app).toHaveURL(new RegExp(`/collections/${id}$`));

  // Asserted from the page rather than the API: this is the thing the user is
  // looking at when they wonder whether the paste worked.
  await expect(app.getByText(/2 members/)).toBeVisible();
  await expect(app.getByRole('link', { name: /stripe/i })).toHaveCount(1);
  await expect(app.getByRole('link', { name: /linear/i })).toHaveCount(1);

  // And the duplicate was filed, not cloned: the workspace still has one Stripe.
  await visit(app, '/companies?q=stripe');
  await expect(app.getByRole('link', { name: /stripe/i })).toHaveCount(1);
});
