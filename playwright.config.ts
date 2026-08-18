import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests, deliberately separate from Vitest.
 *
 * Vitest here is server-side only and always has been — it calls helpers and
 * handlers, never a component. That gap let a real bug ship: a ticked row
 * rendered as unticked because `preventDefault()` on a checkbox click makes the
 * browser restore `input.checked` after every handler has run. Six hundred
 * passing tests could not see it; clicking the box was the only way.
 *
 * So this runs against a **production build**, not `vite dev`. The failure mode
 * CLAUDE.md documents at length — a lazily-imported component blanking every
 * page on hydration — appears only in a built app, and testing dev would be
 * testing the one configuration where it cannot happen.
 *
 * Not part of `npm run check`: it needs a build and a browser download, and a
 * type check that takes four minutes stops being run. CI gives it its own job,
 * next to the Extension and Mobile ones.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4183',
    /**
     * The service worker auto-registers in production builds and takes over
     * navigations to exactly the routes these specs drive, so a page could be
     * served from a cache an earlier assertion wrote — which showed up as a
     * click landing on a page whose script never ran, intermittently and in a
     * different spec each run. Its caching deserves its own coverage; it has
     * no business deciding whether a checkbox works.
     */
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `node build/index.js`, not `vite dev` — see above. The script seeds a
    // throwaway database before booting; Playwright starts `webServer` before
    // any setup hook, so the seed has to live there.
    command: 'node e2e/server.mjs',
    // Always fresh: a reused server is holding a database from a previous run,
    // and these specs write.
    reuseExistingServer: false,
    url: 'http://127.0.0.1:4183/auth',
    timeout: 60_000
  }
});
