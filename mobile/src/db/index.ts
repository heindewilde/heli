import * as SQLite from 'expo-sqlite';
// The SQL itself lives in a dependency-free module so tests/mirror.test.ts can
// run these exact statements against a real SQLite. One copy, not two.
import { DROP_MIRROR, SCHEMA, SCHEMA_VERSION } from './statements';

/**
 * The local mirror.
 *
 * Screens never read from the network — they read from here, and a fetch is
 * something that *updates* here. That inversion is what makes offline a
 * property of the app rather than a mode it switches into, and it is why this
 * is a real SQLite database rather than a query cache with a persistence
 * plugin: a CRM with thousands of people should not re-serialise its whole
 * cache on every write, and a cold start offline should be as fast as a warm
 * one.
 *
 * The mirror is **disposable by construction**. It stores only what the server
 * already has, so it is never migrated — a schema change bumps `SCHEMA_VERSION`
 * and the tables are dropped and recreated. The outbox is the one exception and
 * is carried across, because it holds writes the server has *not* seen yet.
 *
 * Every row carries `workspace_id`, and every accessor takes one. That is the
 * mobile analogue of `Scope` on the server, and it exists for the same reason
 * `PURGE_API` does on the web: switching workspace must not paint the previous
 * tenant's rows.
 */


let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;


export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const handle = await SQLite.openDatabaseAsync('heli.db');
  // WAL for the same reason the server uses it: a read during a write should
  // not block the UI thread.
  await handle.execAsync('PRAGMA journal_mode = WAL;');
  await handle.execAsync(SCHEMA);

  const row = await handle.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'schema_version'`
  );
  const found = row ? Number(row.value) : 0;

  if (found !== SCHEMA_VERSION) {
    // Drop and recreate rather than migrate. Everything here is a copy of
    // server state and can be refetched; the outbox is deliberately excluded
    // because it is the one table holding data the server has never seen.
    await handle.execAsync(DROP_MIRROR);
    await handle.execAsync(SCHEMA);
    await handle.runAsync(
      `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`,
      String(SCHEMA_VERSION)
    );
  }

  return handle;
}

/**
 * Forget everything belonging to a tenant.
 *
 * Called on sign-out and on workspace switch — the mobile counterpart of the
 * web's `PURGE_API` message to the service worker. A stale row from another
 * workspace is both a wrong answer and a leak of a record's name.
 */
export async function purgeWorkspace(workspaceId: string): Promise<void> {
  const handle = await db();
  for (const table of ['people', 'companies', 'interactions']) {
    await handle.runAsync(`DELETE FROM ${table} WHERE workspace_id = ?`, workspaceId);
  }
}

export async function purgeAll(): Promise<void> {
  const handle = await db();
  await handle.execAsync(`
    DELETE FROM people;
    DELETE FROM companies;
    DELETE FROM interactions;
    DELETE FROM outbox;
  `);
}
