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

/**
 * The Add control, and the reason it is a component rather than a snippet.
 *
 * It is rendered twice — once in the toolbar, once in the empty state — and as
 * a snippet both renders closed over one `$state`, so clicking either opened
 * *both* panels at once. That is the "one popover per instance" rule, and the
 * only thing that can see it is a browser counting open panels.
 */
test('opening Add on an empty collection shows exactly one panel', async ({ app }) => {
  // An *empty* collection specifically: that is the only state where the Add
  // control renders twice (toolbar and empty state), which is what made the
  // shared-state bug visible. On a populated collection this would pass
  // whether or not the bug existed.
  const res = await app.request.post('/api/collections', {
    data: { name: 'Empty for Add test' }
  });
  const { id } = (await res.json()) as { id: string };

  await visit(app, `/collections/${id}`);

  const addButtons = app.getByRole('button', { name: 'Add', exact: true });
  await expect(addButtons).toHaveCount(2);

  await addButtons.last().click();

  await expect(app.getByRole('dialog', { name: 'Add to collection' })).toHaveCount(1);
  await expect(app.getByPlaceholder('Search people and companies…')).toHaveCount(1);
});

test('the Add picker searches both kinds in one field, and follows the kind filter', async ({
  app
}) => {
  await visit(app, url());

  await app.getByRole('button', { name: 'Add', exact: true }).first().click();
  const field = app.getByPlaceholder('Search people and companies…');
  await field.fill('a');

  // One list, both kinds, no nested scroller: the panel *is* the list.
  await expect(
    app.getByRole('dialog', { name: 'Add to collection' }).getByRole('option').first()
  ).toBeVisible();

  await app.keyboard.press('Escape');
  await kindSegment(app, /^Companies/).click();
  await app.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(app.getByPlaceholder('Search companies…')).toBeVisible();
});

/**
 * The export link is built client-side from `page.url.searchParams`. Reading
 * `kind` in `+page.server.ts` to build it would work, cost a server round trip
 * per segment click, and break nothing visible — so the surviving search text
 * is what catches it, exactly as in the load test above.
 */
test('the export follows the kind segment without re-running the load', async ({ app }) => {
  await visit(app, url());

  const download = () => app.getByRole('link', { name: 'Download CSV' });

  await app.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(download()).toHaveAttribute('href', /kind=collection/);
  await expect(download()).not.toHaveAttribute('href', /members=/);
  await app.keyboard.press('Escape');

  await app.getByLabel('Search members').fill('ada');
  await kindSegment(app, /^Companies/).click();

  await app.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(download()).toHaveAttribute('href', /members=companies/);
  // The load did not re-run, so the typed needle is still there.
  await expect(app.getByLabel('Search members')).toHaveValue('ada');
  // And the needle is deliberately not in the export — it has no server side.
  await expect(download()).not.toHaveAttribute('href', /[?&]q=/);
});

test('the export panel names what it will export', async ({ app }) => {
  // Clicking Export under a kind filter must not silently produce half a
  // collection, so the panel states the scope before the download exists.
  await visit(app, url());
  const panel = app.getByRole('dialog', { name: 'Export' });

  await app.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(panel).toContainText(/\d+ members?/);
  await app.keyboard.press('Escape');

  await kindSegment(app, /^Companies/).click();
  await app.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(panel).toContainText(/\d+ (company|companies)/);
});

test('picking from the Add panel puts the member in the collection', async ({ app }) => {
  // The picker was rewritten from two chip fields to one panel combobox, so the
  // happy path is worth driving rather than assuming.
  const made = await app.request.post('/api/collections', { data: { name: 'Add flow' } });
  const { id } = (await made.json()) as { id: string };

  await visit(app, `/collections/${id}`);
  await expect(app.getByText('Nothing here yet')).toBeVisible();

  await app.getByRole('button', { name: 'Add', exact: true }).last().click();
  await app.getByPlaceholder('Search people and companies…').fill('Ada');
  await app.getByRole('option', { name: /Ada Lovelace/ }).first().click();

  await expect(app.getByRole('link', { name: 'Ada Lovelace' })).toBeVisible();
  await expect(app.getByText(/1 member/)).toBeVisible();
});

test('the Add picker does not offer someone already in the collection', async ({ app }) => {
  await visit(app, url());

  await app.getByRole('button', { name: 'Add', exact: true }).first().click();
  await app.getByPlaceholder('Search people and companies…').fill('Ada');

  // Ada is already a member of the seeded collection, so suggesting her again
  // would be offering a no-op.
  await expect(app.getByRole('option', { name: /Ada Lovelace/ })).toHaveCount(0);
});
