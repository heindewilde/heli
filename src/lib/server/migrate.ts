import type { Client } from '@libsql/client';
import { client as getClient, allRegionUrls, primaryClient } from './db';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT,
  created_at INTEGER NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_companies_user_arch ON companies(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_companies_user_fav ON companies(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_companies_user_domain ON companies(user_id, domain);
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_user_url ON companies(user_id, url);

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
CREATE INDEX IF NOT EXISTS idx_people_user_arch ON people(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_people_user_fav ON people(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_people_user_company ON people(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_people_user_domain ON people(user_id, domain);
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_user_url ON people(user_id, url);

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
CREATE INDEX IF NOT EXISTS idx_interactions_user_occurred ON interactions(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_interactions_user_company ON interactions(user_id, company_id);

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
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_user_slug_scope ON tags(user_id, slug, scope);

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

CREATE TABLE IF NOT EXISTS interaction_tags (
  interaction_id TEXT NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (interaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  remind_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_at ON reminders(user_id, remind_at);

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
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_user_end ON projects(user_id, end_date);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at);

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

CREATE TABLE IF NOT EXISTS project_tags (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);
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
`;

async function execMany(c: Client, sql: string) {
  // executeMultiple parses CREATE TRIGGER … BEGIN … END; bodies correctly,
  // unlike a naive split(';') which trips over the inner statements.
  await c.executeMultiple(sql);
}

const ALTERS: string[] = [
  `ALTER TABLE people ADD COLUMN suggested_company_name TEXT`,
  `ALTER TABLE people ADD COLUMN suggested_company_url TEXT`
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

async function rebuildFts(c: Client) {
  // Cheap and idempotent: only rebuild if FTS tables look out of sync with the source table.
  for (const name of ['people', 'companies', 'interactions', 'projects']) {
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

async function migrateOne(c: Client) {
  await execMany(c, DDL);
  await applyAlters(c);
  await execMany(c, FTS);
  await rebuildFts(c);
  await janitor(c);
}

export async function migrate(): Promise<void> {
  const seen = new Set<string>();
  for (const [region, url] of allRegionUrls()) {
    if (seen.has(url)) continue;
    seen.add(url);
    await migrateOne(getClient(region));
  }
  // Ensure primary DB is migrated even if its region key wasn't in the iteration list.
  const pc = primaryClient();
  if (!seen.has((pc as unknown as { url?: string }).url ?? '')) {
    await migrateOne(pc);
  }
}
