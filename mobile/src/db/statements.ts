/**
 * The mirror's SQL and row mapping, separated from `expo-sqlite`.
 *
 * `cache.ts` and `index.ts` execute these against the device's database. This
 * module imports nothing, which is the point: `tests/mirror.test.ts` runs the
 * *same statements* against a real SQLite through `@libsql/client`, so the
 * schema, the upserts, the tenancy filtering and the row mapping are verified
 * on a laptop rather than being taken on trust until someone has a phone.
 *
 * That is the only part of the mirror a device is genuinely required for —
 * `expo-sqlite` binding to the platform. The SQL is the part that can be wrong
 * in interesting ways, and it no longer has to wait.
 *
 * Keep this dependency-free.
 */

export const SCHEMA_VERSION = 1;

export const SCHEMA = `
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
  people_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_interactions_ws ON interactions(workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body TEXT,
  idempotency_key TEXT NOT NULL,
  entity_table TEXT,
  entity_id TEXT,
  prev TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox(state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** The mirror is disposable; a version bump drops and rebuilds it. */
export const DROP_MIRROR = `
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS interactions;
`;

/**
 * `pending` is deliberately absent from every DO UPDATE SET list.
 *
 * A server row landing while an optimistic edit is still queued must not clear
 * the marker that says so — otherwise the row silently stops looking pending
 * while its write is still in the outbox.
 */
export const UPSERT_PERSON = `
INSERT INTO people
  (id, workspace_id, name, role, company_id, company_name, email, phone,
   avatar_url, favicon_url, url, priority, status_id, is_favorite,
   is_archived, created_at, updated_at, last_at, pending)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, role=excluded.role, company_id=excluded.company_id,
  company_name=excluded.company_name, email=excluded.email, phone=excluded.phone,
  avatar_url=excluded.avatar_url, favicon_url=excluded.favicon_url, url=excluded.url,
  priority=excluded.priority, status_id=excluded.status_id,
  is_favorite=excluded.is_favorite, is_archived=excluded.is_archived,
  updated_at=excluded.updated_at, last_at=excluded.last_at
`;

export const UPSERT_COMPANY = `
INSERT INTO companies
  (id, workspace_id, name, domain, url, logo_url, favicon_url, industry,
   location, priority, status_id, is_favorite, is_archived, created_at,
   updated_at, last_at, pending)
VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,0)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, domain=excluded.domain, url=excluded.url,
  logo_url=excluded.logo_url, favicon_url=excluded.favicon_url,
  industry=excluded.industry, location=excluded.location,
  is_favorite=excluded.is_favorite, is_archived=excluded.is_archived,
  updated_at=excluded.updated_at, last_at=excluded.last_at
`;

export const UPSERT_INTERACTION = `
INSERT INTO interactions
  (id, workspace_id, occurred_at, type, title, body, company_id,
   company_name, people_json, created_at, updated_at, pending)
VALUES (?,?,?,?,?,?,?,?,?,?,?,0)
ON CONFLICT(id) DO UPDATE SET
  occurred_at=excluded.occurred_at, type=excluded.type, title=excluded.title,
  body=excluded.body, company_id=excluded.company_id,
  company_name=excluded.company_name, people_json=excluded.people_json,
  updated_at=excluded.updated_at, pending=0
`;

/**
 * Build the people query.
 *
 * Every branch keeps `workspace_id = ?` first. That is the mirror's equivalent
 * of `Scope` on the server: there is no way to ask this module for rows without
 * naming a workspace, so a screen cannot accidentally read another tenant's
 * data after a switch.
 */
export function peopleQuery(opts: {
  archived?: boolean;
  favorite?: boolean;
  q?: string;
  limit?: number;
}): { sql: string; args: (string | number)[] } {
  const where = ['workspace_id = ?'];
  const args: (string | number)[] = [];

  where.push(opts.archived ? 'is_archived = 1' : 'is_archived = 0');
  if (opts.favorite) where.push('is_favorite = 1');
  if (opts.q) {
    where.push('(name LIKE ? OR company_name LIKE ? OR email LIKE ?)');
    const like = `%${opts.q}%`;
    args.push(like, like, like);
  }

  return {
    sql: `SELECT * FROM people WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC LIMIT ?`,
    args: [...args, opts.limit ?? 50]
  };
}

export function companiesQuery(opts: { q?: string; limit?: number }): {
  sql: string;
  args: (string | number)[];
} {
  const where = ['workspace_id = ?', 'is_archived = 0'];
  const args: (string | number)[] = [];
  if (opts.q) {
    where.push('(name LIKE ? OR domain LIKE ? OR industry LIKE ?)');
    const like = `%${opts.q}%`;
    args.push(like, like, like);
  }
  return {
    sql: `SELECT * FROM companies WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC LIMIT ?`,
    args: [...args, opts.limit ?? 50]
  };
}

/** Rows ready to send: pending, and past their backoff. */
export const NEXT_OUTBOX_ENTRY = `
SELECT * FROM outbox
 WHERE state = 'pending' AND next_attempt_at <= ?
 ORDER BY created_at LIMIT 1
`;

/** A queued, not-yet-attempted PATCH for the same row, to merge into. */
export const COALESCE_TARGET = `
SELECT id, body FROM outbox
 WHERE state = 'pending' AND attempts = 0 AND method = 'PATCH'
   AND entity_table = ? AND entity_id = ?
 ORDER BY created_at DESC LIMIT 1
`;
