import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';

/**
 * A throwaway database for one test file.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 * 1. It is a temp *file*, never `:memory:`. `buildBundle` in db.ts gates
 *    `applyPragmas` on `url.startsWith('file:')`, so an in-memory URL would
 *    silently skip `PRAGMA foreign_keys = ON` and every FK-dependent
 *    assertion would pass for the wrong reason.
 *
 * 2. The env has to be set *before* db.ts is first imported, because
 *    PRIMARY_REGION and HAS_REMOTE_REPLICAS are module-load constants. Hence
 *    the dynamic imports below — a static `import { initDb } from ...` at the
 *    top of a test file would evaluate db.ts before `freshDb()` ever runs.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type TestDb = {
  client: Client;
  dir: string;
  cleanup: () => void;
};

export async function freshDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), 'heli-test-'));
  const dbPath = join(dir, 'test.db');

  // Any of these would send the suite at a real database.
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_EU',
    'DATABASE_URL_US',
    'DATABASE_URL_APAC',
    'DATABASE_AUTH_TOKEN',
    'DATABASE_AUTH_TOKEN_EU',
    'DATABASE_AUTH_TOKEN_US',
    'DATABASE_AUTH_TOKEN_APAC',
    'PRIMARY_REGION'
  ]) {
    delete process.env[key];
  }
  process.env.DB_PATH = dbPath;

  // Belt and braces: if a future refactor stops honouring DB_PATH, fail loudly
  // rather than migrating the developer's working database.
  if (resolve(dbPath).startsWith(REPO_ROOT)) {
    throw new Error(`refusing to run tests against a database inside the repo: ${dbPath}`);
  }

  const { initDb, client } = await import('../../src/lib/server/db');
  const { migrate } = await import('../../src/lib/server/migrate');
  await initDb();
  await migrate();

  return {
    client: client(),
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}
