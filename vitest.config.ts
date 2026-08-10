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
  resolve: {
    // Server modules import each other through `$lib/...` (e.g.
    // saveInteraction.ts -> $lib/interactions), which only SvelteKit resolves.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
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
