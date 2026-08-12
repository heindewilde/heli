import * as SQLite from 'expo-sqlite';

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

const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  company_id TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  favicon_url TEXT,
  url TEXT,
  priority INTEGER,
  status_id TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_at INTEGER,
  -- Set while an optimistic write for this row is still in the outbox, so the
  -- UI can mark it pending without joining across tables on every render.
  pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_people_ws ON people(workspace_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  url TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  industry TEXT,
  location TEXT,
  priority INTEGER,
  status_id TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_at INTEGER,
  pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_companies_ws ON companies(workspace_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  company_id TEXT,
  company_name TEXT,
  -- JSON array of { id, name, avatarUrl }, as v1 returns it. Denormalised
  -- because it is only ever rendered, never queried.
  people_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_interactions_ws ON interactions(workspace_id, occurred_at DESC);

/**
 * Writes the server has not accepted yet.
 *
 * Survives a schema reset, because dropping it would silently discard work
 * somebody did offline.
 */
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body TEXT,
  -- Sent as Idempotency-Key. Generated once, at enqueue time, so a retry after
  -- an ambiguous timeout cannot create a second record.
  idempotency_key TEXT NOT NULL,
  entity_table TEXT,
  entity_id TEXT,
  -- JSON snapshot of the row before the optimistic patch, for rollback.
  prev TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox(state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

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
    await handle.execAsync(`
      DROP TABLE IF EXISTS people;
      DROP TABLE IF EXISTS companies;
      DROP TABLE IF EXISTS interactions;
    `);
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
