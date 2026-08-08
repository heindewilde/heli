import type { Client } from '@libsql/client';
import { client as getClient, allRegionUrls, primaryClient, primaryRegion } from './db';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT,
  created_at INTEGER NOT NULL
);

-- Tenancy. Declared before every table that references workspaces(id), because
-- PRAGMA foreign_keys = ON is set in db.ts.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  -- Deliberately NOT "ON DELETE CASCADE": a mis-ordered account delete should
  -- error loudly rather than silently vaporize a shared workspace.
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'free',
  seat_limit INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  token TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_ws ON workspace_invites(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);
-- Partial index: at most one *live* invite per (workspace, email), while still
-- allowing a re-invite after a revoke or an expiry. Nothing else in this schema
-- uses a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invites_pending
  ON workspace_invites(workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- The version tracking this migrator otherwise lacks. Gates one-shot backfills
-- so they don't re-scan every table on every boot.
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS email_routing (
  email TEXT PRIMARY KEY,
  region TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  description TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  industry TEXT,
  location TEXT,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes for this table live in WORKSPACE_INDEXES / WORKSPACE_UNIQUES,
-- applied after the workspace backfill.

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  domain TEXT,
  handle TEXT,
  role TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  avatar_url TEXT,
  favicon_url TEXT,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES / WORKSPACE_UNIQUES.

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurred_at INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES.

CREATE TABLE IF NOT EXISTS interaction_people (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_ip_person ON interaction_people(person_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  scope TEXT NOT NULL
);
-- Tenancy index: see WORKSPACE_UNIQUES.

CREATE TABLE IF NOT EXISTS person_tags (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, tag_id)
);

CREATE TABLE IF NOT EXISTS company_tags (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, tag_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  remind_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- Tenancy index: see WORKSPACE_INDEXES (reminders are personal — indexed on
-- (workspace_id, user_id, remind_at), not workspace alone).

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_date INTEGER,
  end_date INTEGER,
  billing_type TEXT NOT NULL DEFAULT 'none',
  hourly_rate INTEGER,
  fixed_fee INTEGER,
  currency TEXT,
  next_step TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES.

CREATE TABLE IF NOT EXISTS project_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_links_project ON project_links(project_id);

CREATE TABLE IF NOT EXISTS project_people (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_person ON project_people(person_id);

CREATE TABLE IF NOT EXISTS project_companies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_company ON project_companies(company_id);

CREATE TABLE IF NOT EXISTS interaction_projects (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_ip_project ON interaction_projects(project_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES.

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_items_ref ON collection_items(kind, ref_id);

CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_view TEXT NOT NULL DEFAULT 'kanban',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES.

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'open',
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_pos ON pipeline_stages(pipeline_id, position);

CREATE TABLE IF NOT EXISTS pipeline_items (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
  entered_stage_at INTEGER NOT NULL,
  note TEXT,
  value_cents INTEGER,
  currency TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_items_pipeline_ref ON pipeline_items(pipeline_id, kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_ref ON pipeline_items(kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_pipeline_stage ON pipeline_items(pipeline_id, stage_id);

CREATE TABLE IF NOT EXISTS pipeline_item_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES pipeline_items(id) ON DELETE CASCADE,
  from_stage_id TEXT,
  to_stage_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  by_user_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pipeline_item_events_item_at ON pipeline_item_events(item_id, at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_accounts_provider ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS collection_pipeline_syncs (
  collection_id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
  pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cps_pipeline ON collection_pipeline_syncs(pipeline_id);

CREATE TABLE IF NOT EXISTS people_statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES / WORKSPACE_UNIQUES.

CREATE TABLE IF NOT EXISTS company_statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Tenancy indexes: see WORKSPACE_INDEXES / WORKSPACE_UNIQUES.

CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (date, metric)
);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_metric_date ON daily_metrics(metric, date);
`;

const FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  name, role, notes, location,
  content='people', content_rowid='rowid', tokenize='unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  name, description, notes, industry, location,
  content='companies', content_rowid='rowid', tokenize='unicode61'
);
CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
  title, body,
  content='interactions', content_rowid='rowid', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, role, notes, location)
  VALUES (new.rowid, new.name, COALESCE(new.role,''), COALESCE(new.notes,''), COALESCE(new.location,''));
END;
CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, role, notes, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.role,''), COALESCE(old.notes,''), COALESCE(old.location,''));
END;
CREATE TRIGGER IF NOT EXISTS people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, role, notes, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.role,''), COALESCE(old.notes,''), COALESCE(old.location,''));
  INSERT INTO people_fts(rowid, name, role, notes, location)
  VALUES (new.rowid, new.name, COALESCE(new.role,''), COALESCE(new.notes,''), COALESCE(new.location,''));
END;

CREATE TRIGGER IF NOT EXISTS companies_ai AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid, name, description, notes, industry, location)
  VALUES (new.rowid, new.name, COALESCE(new.description,''), COALESCE(new.notes,''), COALESCE(new.industry,''), COALESCE(new.location,''));
END;
CREATE TRIGGER IF NOT EXISTS companies_ad AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, notes, industry, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''), COALESCE(old.notes,''), COALESCE(old.industry,''), COALESCE(old.location,''));
END;
CREATE TRIGGER IF NOT EXISTS companies_au AFTER UPDATE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, name, description, notes, industry, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''), COALESCE(old.notes,''), COALESCE(old.industry,''), COALESCE(old.location,''));
  INSERT INTO companies_fts(rowid, name, description, notes, industry, location)
  VALUES (new.rowid, new.name, COALESCE(new.description,''), COALESCE(new.notes,''), COALESCE(new.industry,''), COALESCE(new.location,''));
END;

CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
  INSERT INTO interactions_fts(rowid, title, body)
  VALUES (new.rowid, new.title, COALESCE(new.body,''));
END;
CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
  INSERT INTO interactions_fts(interactions_fts, rowid, title, body)
  VALUES('delete', old.rowid, old.title, COALESCE(old.body,''));
END;
CREATE TRIGGER IF NOT EXISTS interactions_au AFTER UPDATE ON interactions BEGIN
  INSERT INTO interactions_fts(interactions_fts, rowid, title, body)
  VALUES('delete', old.rowid, old.title, COALESCE(old.body,''));
  INSERT INTO interactions_fts(rowid, title, body)
  VALUES (new.rowid, new.title, COALESCE(new.body,''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
  name, description, next_step,
  content='projects', content_rowid='rowid', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO projects_fts(rowid, name, description, next_step)
  VALUES (new.rowid, new.name, COALESCE(new.description,''), COALESCE(new.next_step,''));
END;
CREATE TRIGGER IF NOT EXISTS projects_ad AFTER DELETE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description, next_step)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''), COALESCE(old.next_step,''));
END;
CREATE TRIGGER IF NOT EXISTS projects_au AFTER UPDATE ON projects BEGIN
  INSERT INTO projects_fts(projects_fts, rowid, name, description, next_step)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''), COALESCE(old.next_step,''));
  INSERT INTO projects_fts(rowid, name, description, next_step)
  VALUES (new.rowid, new.name, COALESCE(new.description,''), COALESCE(new.next_step,''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS collections_fts USING fts5(
  name, description,
  content='collections', content_rowid='rowid', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS collections_ai AFTER INSERT ON collections BEGIN
  INSERT INTO collections_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description,''));
END;
CREATE TRIGGER IF NOT EXISTS collections_ad AFTER DELETE ON collections BEGIN
  INSERT INTO collections_fts(collections_fts, rowid, name, description)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''));
END;
CREATE TRIGGER IF NOT EXISTS collections_au AFTER UPDATE ON collections BEGIN
  INSERT INTO collections_fts(collections_fts, rowid, name, description)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''));
  INSERT INTO collections_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description,''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS pipelines_fts USING fts5(
  name, description,
  content='pipelines', content_rowid='rowid', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS pipelines_ai AFTER INSERT ON pipelines BEGIN
  INSERT INTO pipelines_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description,''));
END;
CREATE TRIGGER IF NOT EXISTS pipelines_ad AFTER DELETE ON pipelines BEGIN
  INSERT INTO pipelines_fts(pipelines_fts, rowid, name, description)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''));
END;
CREATE TRIGGER IF NOT EXISTS pipelines_au AFTER UPDATE ON pipelines BEGIN
  INSERT INTO pipelines_fts(pipelines_fts, rowid, name, description)
  VALUES('delete', old.rowid, old.name, COALESCE(old.description,''));
  INSERT INTO pipelines_fts(rowid, name, description)
  VALUES (new.rowid, new.name, COALESCE(new.description,''));
END;
`;

async function execMany(c: Client, sql: string) {
  // executeMultiple parses CREATE TRIGGER … BEGIN … END; bodies correctly,
  // unlike a naive split(';') which trips over the inner statements.
  await c.executeMultiple(sql);
}

const ALTERS: string[] = [
  `ALTER TABLE people ADD COLUMN suggested_company_name TEXT`,
  `ALTER TABLE people ADD COLUMN suggested_company_url TEXT`,
  // Priority + per-user statuses for People & Companies (database-grid redesign)
  `ALTER TABLE people ADD COLUMN priority INTEGER`,
  `ALTER TABLE people ADD COLUMN status_id TEXT REFERENCES people_statuses(id) ON DELETE SET NULL`,
  `ALTER TABLE companies ADD COLUMN priority INTEGER`,
  `ALTER TABLE companies ADD COLUMN size_band TEXT`,
  `ALTER TABLE companies ADD COLUMN status_id TEXT REFERENCES company_statuses(id) ON DELETE SET NULL`,
  // (Priority/status filter indexes now live in WORKSPACE_INDEXES, keyed by
  // workspace_id rather than user_id.)
  // Social URLs surfaced as icons on detail pages.
  `ALTER TABLE people ADD COLUMN linkedin_url TEXT`,
  `ALTER TABLE people ADD COLUMN x_url TEXT`,
  `ALTER TABLE companies ADD COLUMN linkedin_url TEXT`,
  `ALTER TABLE companies ADD COLUMN x_url TEXT`,
  // Icon picker for collections.
  `ALTER TABLE collections ADD COLUMN icon TEXT`,
  // Icon picker for projects.
  `ALTER TABLE projects ADD COLUMN icon TEXT`,
  // Stage color picker on pipeline creation.
  `ALTER TABLE pipeline_stages ADD COLUMN color TEXT`,
  // ── Workspace tenancy ──────────────────────────────────────────────────────
  // Added nullable, then filled by backfillWorkspaces(). SQLite cannot add a
  // NOT NULL column without a default, so enforcement lives in Drizzle
  // (`.notNull()`) rather than the DB. Deliberately applied to fresh installs
  // too, so a new database and a migrated one end up with identical schemas.
  `ALTER TABLE companies ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE company_statuses ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE people ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE people_statuses ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE interactions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE tags ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE reminders ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE collections ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE pipelines ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE collection_pipeline_syncs ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`,
  `ALTER TABLE sessions ADD COLUMN active_workspace_id TEXT`,
  `ALTER TABLE workspace_invites ADD COLUMN revoked_at INTEGER`
];

// Tables carrying workspace_id, in the order the backfill fills them. Also the
// canonical list for the attribution reassignment done on member removal.
export const TENANT_TABLES = [
  'companies',
  'company_statuses',
  'people',
  'people_statuses',
  'interactions',
  'tags',
  'reminders',
  'tasks',
  'projects',
  'collections',
  'pipelines',
  'collection_pipeline_syncs'
] as const;

// Applied after the backfill so they are built against real data.
const WORKSPACE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_companies_ws_arch ON companies(workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_companies_ws_fav ON companies(workspace_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_companies_ws_domain ON companies(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_companies_ws_priority ON companies(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_companies_ws_status ON companies(workspace_id, status_id);
CREATE INDEX IF NOT EXISTS idx_company_statuses_ws_sort ON company_statuses(workspace_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_people_ws_arch ON people(workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_people_ws_fav ON people(workspace_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_people_ws_company ON people(workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_people_ws_domain ON people(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_people_ws_priority ON people(workspace_id, priority);
CREATE INDEX IF NOT EXISTS idx_people_ws_status ON people(workspace_id, status_id);
CREATE INDEX IF NOT EXISTS idx_people_statuses_ws_sort ON people_statuses(workspace_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_interactions_ws_occurred ON interactions(workspace_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_ws_company ON interactions(workspace_id, company_id);

-- Reminders are personal, so user_id sits inside the index, not just the table.
CREATE INDEX IF NOT EXISTS idx_reminders_ws_user_at ON reminders(workspace_id, user_id, remind_at);

CREATE INDEX IF NOT EXISTS idx_tasks_ws_ref ON tasks(workspace_id, kind, ref_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_ws_due ON tasks(workspace_id, due_at);

CREATE INDEX IF NOT EXISTS idx_projects_ws_status ON projects(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_ws_end ON projects(workspace_id, end_date);
CREATE INDEX IF NOT EXISTS idx_projects_ws_updated ON projects(workspace_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_collections_ws_arch ON collections(workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_collections_ws_updated ON collections(workspace_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_pipelines_ws_arch ON pipelines(workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_pipelines_ws_updated ON pipelines(workspace_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_cps_ws ON collection_pipeline_syncs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active_ws ON sessions(active_workspace_id, user_id);
`;

// Kept separate from WORKSPACE_INDEXES: a UNIQUE violation here is NOT swallowed
// by applyAlters' duplicate-column catch, and an uncaught throw at boot means a
// crash-loop on someone's VPS. The backfill's bijection (workspaces.id =
// users.id) guarantees these cannot collide, so a failure means an invariant was
// already broken — log it loudly and keep serving rather than refusing to start.
const WORKSPACE_UNIQUES: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_ws_url ON companies(workspace_id, url)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_people_ws_url ON people(workspace_id, url)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_ws_slug_scope ON tags(workspace_id, slug, scope)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_people_statuses_ws_name ON people_statuses(workspace_id, name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_company_statuses_ws_name ON company_statuses(workspace_id, name)`
];

// The old per-user uniques MUST go before invites ship. Once a member can be
// removed, their rows are reassigned to the workspace owner — and the owner may
// already have a row with the same url/slug/name in a *different* workspace.
// Workspace-level dedup says nothing about cross-workspace collisions, so
// leaving these in place would make member removal fail with a UNIQUE violation.
const DROPPED_INDEXES: string[] = [
  `DROP INDEX IF EXISTS uq_companies_user_url`,
  `DROP INDEX IF EXISTS uq_people_user_url`,
  `DROP INDEX IF EXISTS uq_tags_user_slug_scope`,
  `DROP INDEX IF EXISTS uq_people_statuses_user_name`,
  `DROP INDEX IF EXISTS uq_company_statuses_user_name`,
  // Non-unique leftovers — harmless, but they cost write amplification and disk.
  `DROP INDEX IF EXISTS idx_companies_user_arch`,
  `DROP INDEX IF EXISTS idx_companies_user_fav`,
  `DROP INDEX IF EXISTS idx_companies_user_domain`,
  `DROP INDEX IF EXISTS idx_companies_user_priority`,
  `DROP INDEX IF EXISTS idx_companies_user_status`,
  `DROP INDEX IF EXISTS idx_company_statuses_user_sort`,
  `DROP INDEX IF EXISTS idx_people_user_arch`,
  `DROP INDEX IF EXISTS idx_people_user_fav`,
  `DROP INDEX IF EXISTS idx_people_user_company`,
  `DROP INDEX IF EXISTS idx_people_user_domain`,
  `DROP INDEX IF EXISTS idx_people_user_priority`,
  `DROP INDEX IF EXISTS idx_people_user_status`,
  `DROP INDEX IF EXISTS idx_people_statuses_user_sort`,
  `DROP INDEX IF EXISTS idx_interactions_user_occurred`,
  `DROP INDEX IF EXISTS idx_interactions_user_company`,
  `DROP INDEX IF EXISTS idx_reminders_user_at`,
  `DROP INDEX IF EXISTS idx_tasks_ref`,
  `DROP INDEX IF EXISTS idx_tasks_user_due`,
  `DROP INDEX IF EXISTS idx_projects_user_status`,
  `DROP INDEX IF EXISTS idx_projects_user_end`,
  `DROP INDEX IF EXISTS idx_projects_user_updated`,
  `DROP INDEX IF EXISTS idx_collections_user_arch`,
  `DROP INDEX IF EXISTS idx_collections_user_updated`,
  `DROP INDEX IF EXISTS idx_pipelines_user_arch`,
  `DROP INDEX IF EXISTS idx_pipelines_user_updated`
];

async function applyAlters(c: Client) {
  for (const stmt of ALTERS) {
    try {
      await c.execute(stmt);
    } catch (err) {
      // SQLite throws "duplicate column name" if the column already exists.
      const msg = (err as Error).message ?? '';
      if (!/duplicate column/i.test(msg)) throw err;
    }
  }
}

const BACKFILL_KEY = 'workspace_backfill_v1';

/**
 * Give every pre-existing user a workspace and stamp workspace_id onto their
 * rows.
 *
 * The workspace id is deliberately the *user* id. That makes the fill a plain
 * `SET workspace_id = user_id`, and — because the mapping is bijective — every
 * old `(user_id, …)` unique index maps onto its `(workspace_id, …)` replacement
 * with no possibility of a collision. It is what makes re-keying five unique
 * indexes on live data safe.
 *
 * Gated on schema_meta: the `WHERE workspace_id IS NULL` updates match nothing
 * after the first run, but without the gate they would still full-scan twelve
 * tables on every single boot.
 */
async function backfillWorkspaces(c: Client, region: string) {
  const done = await c.execute({
    sql: `SELECT value FROM schema_meta WHERE key = ?`,
    args: [BACKFILL_KEY]
  });
  if (done.rows.length > 0) return;

  const now = Date.now();
  await c.execute({
    sql: `INSERT INTO workspaces (id, name, region, owner_user_id, plan, seat_limit, created_at, updated_at)
          SELECT u.id,
                 COALESCE(NULLIF(TRIM(u.username), ''), 'My workspace'),
                 ?, u.id, 'free', NULL, u.created_at, u.created_at
          FROM users u
          WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = u.id)`,
    args: [region]
  });
  await c.execute({
    sql: `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
          SELECT u.id, u.id, 'owner', u.created_at FROM users u`,
    args: []
  });
  for (const t of TENANT_TABLES) {
    await c.execute(`UPDATE ${t} SET workspace_id = user_id WHERE workspace_id IS NULL`);
  }
  // Point live sessions at the new workspace so an upgrade doesn't log anyone out.
  await c.execute(
    `UPDATE sessions SET active_workspace_id = user_id WHERE active_workspace_id IS NULL`
  );

  await c.execute({
    sql: `INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)`,
    args: [BACKFILL_KEY, String(now)]
  });
}

/** Run statements that are individually idempotent, logging rather than throwing. */
async function applyTolerant(c: Client, stmts: string[], label: string) {
  for (const stmt of stmts) {
    try {
      await c.execute(stmt);
    } catch (err) {
      // A crash-loop on a self-hoster's VPS is worse than a missing index.
      console.error(`[migrate] ${label} failed: ${stmt}\n  ${(err as Error).message}`);
    }
  }
}

async function rebuildFts(c: Client) {
  // Cheap and idempotent: only rebuild if FTS tables look out of sync with the source table.
  for (const name of ['people', 'companies', 'interactions', 'projects', 'collections', 'pipelines']) {
    const src = await c.execute(`SELECT COUNT(*) AS n FROM ${name}`);
    const fts = await c.execute(`SELECT COUNT(*) AS n FROM ${name}_fts`);
    const a = Number(src.rows[0]?.n ?? 0);
    const b = Number(fts.rows[0]?.n ?? 0);
    if (a !== b) {
      await c.execute(`INSERT INTO ${name}_fts(${name}_fts) VALUES('rebuild')`);
    }
  }
}

async function janitor(c: Client) {
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  await c.execute({
    sql: `UPDATE people SET source = NULL, updated_at = ? WHERE source = 'parsing' AND updated_at < ?`,
    args: [Date.now(), tenMinAgo]
  });
  await c.execute({
    sql: `UPDATE companies SET source = NULL, updated_at = ? WHERE source = 'parsing' AND updated_at < ?`,
    args: [Date.now(), tenMinAgo]
  });
}

async function migrateOne(c: Client, region: string) {
  await execMany(c, DDL);
  await applyAlters(c);
  // Order matters: columns must exist before the fill, and the fill must happen
  // before the unique indexes are built so they validate against real data.
  await backfillWorkspaces(c, region);
  await execMany(c, WORKSPACE_INDEXES);
  await applyTolerant(c, WORKSPACE_UNIQUES, 'unique index');
  await applyTolerant(c, DROPPED_INDEXES, 'drop index');
  await execMany(c, FTS);
  await rebuildFts(c);
  await janitor(c);
}

export async function migrate(): Promise<void> {
  const seen = new Set<string>();
  for (const [region, url] of allRegionUrls()) {
    if (seen.has(url)) continue;
    seen.add(url);
    // Region labels are stored lowercase everywhere else (REGIONS in db.ts,
    // email_routing, AuthUser.region), but allRegionUrls yields 'EU'/'US'/'APAC'.
    await migrateOne(getClient(region), region.toLowerCase());
  }
  // Ensure primary DB is migrated even if its region key wasn't in the iteration list.
  const pc = primaryClient();
  if (!seen.has((pc as unknown as { url?: string }).url ?? '')) {
    await migrateOne(pc, primaryRegion().toLowerCase());
  }
}
