/**
 * Seeds a throwaway database, then boots the built app against it.
 *
 * The seed lives here rather than in a Playwright `globalSetup` because
 * Playwright starts `webServer` *first* — a setup hook would run after the
 * server had already tried to read a database that did not exist yet. Doing
 * both here also means one ordering to reason about: seed, write the state
 * file, boot, and only then does Playwright's `url` check pass and the specs
 * start reading that file.
 */
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const statePath = fileURLToPath(new URL('./.state.json', import.meta.url));

const out = execFileSync('npx', ['tsx', 'e2e/seed.ts'], { encoding: 'utf8' });
// `seed.ts` prints one JSON line; anything else on stdout is npm noise.
const state = JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop());
writeFileSync(statePath, JSON.stringify(state));

spawn('node', ['build/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `file:${state.dbPath}`,
    PORT: '4183',
    HOST: '127.0.0.1',
    ORIGIN: 'http://127.0.0.1:4183',
    // A background sweep firing mid-assertion is noise, not coverage.
    SCHEDULER_DISABLED: '1'
  }
});
