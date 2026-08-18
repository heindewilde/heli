import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/**
 * Server-side tests only. Deliberately a separate file from `vite.config.ts`:
 * `vite build` never reads this one, so the app build and the Docker image are
 * untouched by anything here.
 *
 * The Svelte plugin is here for one reason: `.svelte.ts` modules (the command
 * registry, the list cache) use runes, and `$state` is a compiler construct —
 * without it they throw "$state is not defined" on import. It is *not* the
 * `sveltekit()` plugin, which brings a dev-server lifecycle this suite has no
 * use for.
 */
export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  /**
   * Pinned so the transform never goes looking for a `tsconfig.json` next to
   * the file it is compiling.
   *
   * Three suites here (`mirror`, `outbox-policy`, `share-intent`) import
   * modules out of `mobile/src`, to test the app's SQL and its share-intent
   * parsing without a device. Discovery walks up from those files, finds
   * `mobile/tsconfig.json`, and cannot load it: that file extends
   * `expo/tsconfig.base`, which resolves out of `mobile/node_modules` — and
   * the App job in `ci.yml` installs only the root, on purpose. So it passed
   * on any laptop that had run the mobile app and failed the moment CI saw it.
   *
   * None of these are type-checked here anyway; `tsc --noEmit` in the Mobile
   * job owns that, with the tsconfig that has expo's base available. This is
   * only about stripping types, and nothing in the shared modules depends on a
   * compiler flag to do it.
   */
  oxc: {
    tsconfig: {
      compilerOptions: {
        // Mirrors the effective values from `.svelte-kit/tsconfig.json`, which
        // is what discovery would have found for everything under src/ and
        // tests/. `verbatimModuleSyntax` is the one that changes emitted code
        // rather than only type checking — with it off, oxc would elide
        // imports it believes are type-only — so it is pinned rather than left
        // to a default.
        target: 'esnext',
        verbatimModuleSyntax: true
      }
    }
  },
  resolve: {
    // Server modules import each other through `$lib/...` (e.g.
    // saveInteraction.ts -> $lib/interactions), which only SvelteKit resolves.
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      // SvelteKit virtual modules; see each stub for why the shim is faithful
      // rather than empty.
      '$env/dynamic/private': fileURLToPath(
        new URL('./tests/helpers/env-stub.ts', import.meta.url)
      ),
      '$app/environment': fileURLToPath(
        new URL('./tests/helpers/app-environment-stub.ts', import.meta.url)
      )
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    reporters: 'dot',
    // Forks, not threads. `db.ts` computes PRIMARY_REGION and
    // HAS_REMOTE_REPLICAS at module load and caches one client bundle per URL
    // in module scope, so a test file that points DB_PATH somewhere new needs a
    // genuinely clean module registry — not a shared worker.
    pool: 'forks'
  }
});
