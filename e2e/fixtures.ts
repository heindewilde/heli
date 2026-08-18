import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

const state = () =>
  JSON.parse(readFileSync(new URL('./.state.json', import.meta.url), 'utf8')) as {
    dbPath: string;
    sessionId: string;
    collectionId: string;
  };

/** The seeded collection's id, so a spec can address its detail page. */
export const seededCollectionId = () => state().collectionId;

/**
 * Every spec runs signed in, and every spec fails on a console error.
 *
 * The second half is the point. The hydration crash CLAUDE.md documents throws
 * once, blanks the page, and leaves markup that still *looks* server-rendered —
 * so an assertion on visible text can pass while the app is dead. Failing the
 * test on the error itself is what actually catches it.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ context, page }, use) => {
    /**
     * No service worker.
     *
     * It auto-registers in production builds and takes over navigations to
     * exactly the routes these specs drive, so a page could be served from a
     * cache written by an earlier assertion — which showed up as a click
     * landing on a page whose script never ran, intermittently and in a
     * different spec each run. Caching behaviour deserves its own coverage;
     * it has no business deciding whether a checkbox works.
     */
    await context.route('**/service-worker.js', (r) => r.abort());

    await context.addCookies([
      {
        name: 'heli_session',
        value: state().sessionId,
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax'
      }
    ]);

    /**
     * Chrome logs its own failure when `serviceWorkers: 'block'` stops the
     * registration — the app already swallows it (`.catch(() => {})`). That is
     * the harness's doing, not the app's, so it is the one thing filtered out.
     */
    const HARNESS_NOISE = /ServiceWorker|service-worker\.js/i;

    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !HARNESS_NOISE.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => {
      if (!HARNESS_NOISE.test(String(e))) errors.push(String(e));
    });

    await use(page);

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  }
});

export { expect };

/**
 * Navigate, then wait until the client has actually taken over.
 *
 * `goto` resolves on `load`, which is before hydration. Clicking a checkbox in
 * that window does nothing at all — the markup is there, the listeners are
 * not — and the spec then fails looking for a toolbar that was never going to
 * appear. That was every flaky failure in this suite, and it is worth a gate
 * rather than a sprinkling of timeouts.
 *
 * The marker is set by the root layout's `onMount`, which by definition runs
 * after the tree is live. SvelteKit's own signals — `history.state`, the
 * `__sveltekit_*` global — are all in place *before* component hydration
 * finishes, so gating on them still let clicks land on nothing.
 */
export async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached' });
}

/**
 * The visible checkbox in each row. Each row renders two — one per layout —
 * and `:visible` keeps only the desktop one, since the mobile card is
 * `display: none` above the `md` breakpoint.
 */
export function rowBoxes(page: Page) {
  return page.locator('li[data-entity-row] input[type=checkbox]:visible');
}

/** The bulk action bar, so "Priority" can't collide with the filter chip. */
export function bulkBar(page: Page) {
  return page.getByRole('toolbar', { name: 'Bulk actions' });
}

/**
 * The rendered opacity of the wrapper that reveals a checkbox on hover.
 *
 * Not `toBeVisible()`: an `opacity-0` element is still visible to Playwright,
 * which is the point — it stays hit-testable and focusable.
 */
export function revealOpacity(page: Page, label: string) {
  return page
    .getByLabel(label)
    .evaluate((el) => getComputedStyle(el.closest('label')!.parentElement!).opacity);
}
