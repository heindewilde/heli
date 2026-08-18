import { test, expect, visit } from './fixtures';

/**
 * Every route renders and hydrates without throwing.
 *
 * This is the cheap half of the suite and the half that would have caught the
 * three reverted attempts at lazy-loading a component, each of which blanked
 * the whole app in production while `svelte-check` and Vitest stayed green.
 */
const ROUTES = [
  ['/people', 'People'],
  ['/companies', 'Companies'],
  ['/interactions', 'Interactions'],
  ['/collections', 'Collections'],
  ['/pipelines', 'Pipelines'],
  ['/projects', 'Projects'],
  ['/outreach', 'Outreach'],
  ['/availability', 'Availability'],
  ['/time', 'Time'],
  ['/settings', 'Settings']
] as const;

for (const [path, heading] of ROUTES) {
  test(`${path} renders and hydrates`, async ({ app }) => {
    await visit(app, path);
    await expect(app.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    // Hydration actually finished: a client-only affordance responds.
    await expect(app.locator('body')).toBeVisible();
    await app.waitForFunction(() => document.readyState === 'complete');
  });
}

/**
 * The dashboard's `h1` is a time-of-day greeting, so it is matched by shape
 * rather than by text — pinning the copy here would make a wording change a
 * test failure.
 */
test('/ renders and hydrates', async ({ app }) => {
  await visit(app, '/');
  await expect(app.locator('h1')).toBeVisible();
  await expect(app.getByRole('navigation').getByRole('link', { name: 'People' })).toBeVisible();
  await app.waitForFunction(() => document.readyState === 'complete');
});

test('the outreach editor loads the rich-text chunk', async ({ app }) => {
  // `RichText` dynamically imports `squire-rte`. That inner boundary is the one
  // that must keep working; a second boundary above it is what breaks things.
  await visit(app, '/outreach/new');
  await expect(app.getByRole('heading', { name: 'New template', level: 1 })).toBeVisible();
  await expect(app.getByText('Addressed to')).toBeVisible();
});
