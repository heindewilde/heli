import { test, expect, visit, seededCollectionId } from './fixtures';

/**
 * The collection detail page's overview controls.
 *
 * Two of these guard properties that no other layer can see. The kind filter
 * lives in the URL but must *not* re-run the server load — SvelteKit tracks
 * search-param dependencies per key, and the load reads only `just`. If someone
 * later reads `kind` there, the feature goes on working and merely gets slower,
 * so nothing catches it except an assertion that client state survived the
 * click. And the list/cards preference is localStorage applied in `onMount` on
 * top of a server render that always says "list" — a hydration seam that Vitest
 * cannot reach at all, and that the fixture's console-error check turns into a
 * failure for free.
 */

const url = () => `/collections/${seededCollectionId()}`;

type App = Parameters<typeof visit>[0];

const cards = (page: App) => page.locator('ul.grid > li');
// Scoped to the control: the sidebar has its own "People" and "Companies" links.
const kindSegment = (page: App, name: RegExp) =>
  page.getByRole('group', { name: 'Member kind' }).getByRole('link', { name });
const viewSegment = (page: App, name: string) =>
  page.getByRole('group', { name: 'View' }).getByRole('button', { name });

test('the kind filter narrows the list and puts itself in the URL', async ({ app }) => {
  await visit(app, url());

  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toBeVisible();

  await kindSegment(app, /^Companies/).click();

  await expect(app).toHaveURL(/\?kind=companies$/);
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toHaveCount(0);
});

test('switching kind does not re-run the server load', async ({ app }) => {
  await visit(app, url());

  // Typed text lives only in the client. It survives the segment click exactly
  // when the load did not re-run and the component was not torn down.
  await app.getByLabel('Search members').fill('a');
  await kindSegment(app, /^People/).click();

  await expect(app).toHaveURL(/\?kind=people$/);
  await expect(app.getByLabel('Search members')).toHaveValue('a');
});

test('the kind segments are links, so a view is shareable', async ({ app }) => {
  await visit(app, url());
  // A `<button onchange>` would filter identically and silently stop being
  // middle-clickable, bookmarkable or linkable.
  await expect(kindSegment(app, /^People/)).toHaveAttribute('href', /\?kind=people$/);
});

test('back restores the previous kind', async ({ app }) => {
  await visit(app, url());
  await kindSegment(app, /^People/).click();
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toHaveCount(0);

  await app.goBack();
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toBeVisible();
});

test('search matches names and tag names, and clears back to the full set', async ({ app }) => {
  await visit(app, url());
  const search = app.getByLabel('Search members');

  await search.fill('grace');
  await expect(app.getByRole('link', { name: 'Grace Hopper' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toHaveCount(0);

  // 'Supplier' is a tag on Acme, not part of any name.
  await search.fill('supplier');
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Grace Hopper' })).toHaveCount(0);

  await search.fill('');
  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Acme Corp' })).toBeVisible();
});

test('a filter with no matches offers a way back', async ({ app }) => {
  await visit(app, url());
  await app.getByLabel('Search members').fill('nobodyatall');

  await expect(app.getByText('No matches')).toBeVisible();
  await app.getByRole('button', { name: 'Clear search' }).click();
  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toBeVisible();
});

test('cards show tags that the compact list does not, and the choice survives a reload', async ({
  app
}) => {
  await visit(app, url());

  // The server always renders the list — the stored preference is applied after
  // hydration, so there is nothing for it to mismatch against.
  await expect(cards(app)).toHaveCount(0);
  await expect(app.getByText('Pioneer')).toHaveCount(0);

  await viewSegment(app, 'Card view').click();
  await expect(cards(app)).toHaveCount(3);
  await expect(app.getByText('Pioneer')).toBeVisible();
  await expect(app.getByText('Supplier')).toBeVisible();

  await app.reload();
  await app.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' });
  await expect(cards(app)).toHaveCount(3);
});

test('a member can be removed from either view', async ({ app }) => {
  await visit(app, url());

  await app.getByRole('button', { name: 'Remove Grace Hopper' }).click();
  await expect(app.getByRole('link', { name: 'Grace Hopper' })).toHaveCount(0);

  await viewSegment(app, 'Card view').click();
  await expect(cards(app)).toHaveCount(2);
  await app.getByRole('button', { name: 'Remove Acme Corp' }).click();
  await expect(cards(app)).toHaveCount(1);
});
