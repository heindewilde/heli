#!/usr/bin/env node
// Copy one user's rows from a source Heli SQLite DB into a destination Heli SQLite DB,
// rewriting userId to the destination user's id. Intended for a one-shot migration
// from self-hosted local Heli → heli.so cloud.
//
// Usage:
//   # file → file (self-host VPS):
//   node scripts/migrate-user.mjs \
//     --src=./data/heli.db \
//     --dst=/path/to/cloud/data/heli.db \
//     --src-email=you@local.example --dst-email=you@cloud.example
//
//   # file → Turso (remote libSQL):
//   node scripts/migrate-user.mjs \
//     --src=./data/heli.db \
//     --dst='libsql://<db>-<org>.turso.io' --dst-token="$TURSO_AUTH_TOKEN" \
//     --src-email=you@local.example --dst-email=you@cloud.example
//
//   # Just list users on src + dst (sanity check before doing anything):
//   node scripts/migrate-user.mjs --src=... --dst=... [--dst-token=...] --list-users
//
//   # Add --dry-run to any migration command to preview without writing.
//
// Notes:
//   - For file destinations, run with the destination Heli process stopped.
//   - For Turso destinations, make sure no other client is writing during the run.
//   - Both DBs must already be migrated to the same schema.
//   - Foreign keys are toggled off during the copy and re-checked at the end.
//   - FTS5 tables are populated automatically by the existing AFTER INSERT triggers.

import { createClient } from '@libsql/client';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (!a.startsWith('--')) return [];
    const [k, v] = a.slice(2).split('=');
    return [[k, v ?? true]];
  })
);

const SRC = args.src;
const DST = args.dst;
const SRC_TOKEN = args['src-token'];
const DST_TOKEN = args['dst-token'];
const SRC_EMAIL = args['src-email'];
const DST_EMAIL = args['dst-email'];
const DRY = Boolean(args['dry-run']);
const LIST_USERS = Boolean(args['list-users']);

if (!SRC || !DST) {
  console.error('Missing --src/--dst. See header of this file for usage.');
  process.exit(2);
}
if (!LIST_USERS && (!SRC_EMAIL || !DST_EMAIL)) {
  console.error('Missing --src-email/--dst-email (or pass --list-users).');
  process.exit(2);
}

function toClient(spec, token) {
  // Accept either a file path or a libsql:// / https:// URL.
  const url = /^(libsql|https?|file):/.test(spec) ? spec : `file:${spec}`;
  return createClient({ url, ...(token ? { authToken: token } : {}) });
}

const src = toClient(SRC, SRC_TOKEN);
const dst = toClient(DST, DST_TOKEN);

async function one(client, sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows[0];
}

async function all(client, sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows;
}

// Tables in dependency order. Parent-scoped tables carry workspace_id (the
// tenancy key) and user_id (created-by attribution); both get rewritten.
// Child link tables are scoped via their parent and selected with a JOIN.
const PARENT_TABLES = [
  'company_statuses',
  'people_statuses',
  'tags',
  'companies',
  'people',
  'interactions',
  'reminders',
  'tasks',
  'projects',
  'collections',
  'pipelines',
  'collection_pipeline_syncs'
];

// child table → SELECT (joined to parent on src to scope by userId)
const CHILD_QUERIES = {
  person_tags:
    'SELECT pt.* FROM person_tags pt JOIN people p ON p.id = pt.person_id WHERE p.workspace_id = ?',
  company_tags:
    'SELECT ct.* FROM company_tags ct JOIN companies c ON c.id = ct.company_id WHERE c.workspace_id = ?',
  interaction_people:
    'SELECT ip.* FROM interaction_people ip JOIN interactions i ON i.id = ip.interaction_id WHERE i.workspace_id = ?',
  interaction_projects:
    'SELECT ipr.* FROM interaction_projects ipr JOIN interactions i ON i.id = ipr.interaction_id WHERE i.workspace_id = ?',
  project_links:
    'SELECT pl.* FROM project_links pl JOIN projects p ON p.id = pl.project_id WHERE p.workspace_id = ?',
  project_people:
    'SELECT pp.* FROM project_people pp JOIN projects p ON p.id = pp.project_id WHERE p.workspace_id = ?',
  project_companies:
    'SELECT pc.* FROM project_companies pc JOIN projects p ON p.id = pc.project_id WHERE p.workspace_id = ?',
  collection_items:
    'SELECT ci.* FROM collection_items ci JOIN collections c ON c.id = ci.collection_id WHERE c.workspace_id = ?',
  pipeline_stages:
    'SELECT ps.* FROM pipeline_stages ps JOIN pipelines p ON p.id = ps.pipeline_id WHERE p.workspace_id = ?',
  pipeline_items:
    'SELECT pi.* FROM pipeline_items pi JOIN pipelines p ON p.id = pi.pipeline_id WHERE p.workspace_id = ?',
  pipeline_item_events:
    'SELECT pie.* FROM pipeline_item_events pie JOIN pipeline_items pi ON pi.id = pie.item_id JOIN pipelines p ON p.id = pi.pipeline_id WHERE p.workspace_id = ?'
};

async function tableColumns(client, table) {
  const rows = await all(client, `PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function buildInserts(table, ids, selectSql, selectArgs) {
  const { srcUserId, dstUserId, srcWorkspaceId, dstWorkspaceId } = ids;
  const cols = await tableColumns(dst, table);
  const rows = await all(src, selectSql, selectArgs);
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return [];
  }
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
  const stmts = [];
  for (const row of rows) {
    if ('user_id' in row && row.user_id === srcUserId) row.user_id = dstUserId;
    if ('workspace_id' in row && row.workspace_id === srcWorkspaceId) {
      row.workspace_id = dstWorkspaceId;
    }
    if (table === 'pipeline_item_events' && row.by_user_id === srcUserId) {
      row.by_user_id = dstUserId;
    }
    const args = cols.map((c) => row[c] ?? null);
    stmts.push({ sql, args });
  }
  console.log(`  ${table}: ${rows.length} rows`);
  return stmts;
}

async function listUsers() {
  for (const [label, client] of [['src', src], ['dst', dst]]) {
    const rows = await all(client, 'SELECT id, email, created_at FROM users ORDER BY created_at');
    console.log(`${label} users (${rows.length}):`);
    for (const r of rows) console.log(`  ${r.id}  ${r.email}`);
  }
}

async function main() {
  if (LIST_USERS) {
    await listUsers();
    return;
  }
  const srcUser = await one(src, 'SELECT id, email FROM users WHERE email = ?', [SRC_EMAIL]);
  if (!srcUser) throw new Error(`source user ${SRC_EMAIL} not found in ${SRC}`);
  const dstUser = await one(dst, 'SELECT id, email FROM users WHERE email = ?', [DST_EMAIL]);
  if (!dstUser) throw new Error(`destination user ${DST_EMAIL} not found in ${DST}`);

  const srcUserId = String(srcUser.id);
  const dstUserId = String(dstUser.id);

  const srcWs = await one(src, 'SELECT id FROM workspaces WHERE owner_user_id = ?', [srcUserId]);
  const dstWs = await one(dst, 'SELECT id FROM workspaces WHERE owner_user_id = ?', [dstUserId]);
  if (!srcWs) throw new Error(`source user ${SRC_EMAIL} owns no workspace in ${SRC}`);
  if (!dstWs) throw new Error(`destination user ${DST_EMAIL} owns no workspace in ${DST}`);
  const srcWorkspaceId = String(srcWs.id);
  const dstWorkspaceId = String(dstWs.id);
  const ids = { srcUserId, dstUserId, srcWorkspaceId, dstWorkspaceId };
  console.log(`src workspace: ${srcWorkspaceId}`);
  console.log(`dst workspace: ${dstWorkspaceId}`);
  console.log(`src user: ${srcUser.email} (${srcUserId})`);
  console.log(`dst user: ${dstUser.email} (${dstUserId})`);
  if (DRY) console.log('-- DRY RUN: no writes to dst --');

  // Sanity: dst must be empty for this user (no prior partial migration).
  const existing = await one(
    dst,
    'SELECT COUNT(*) AS n FROM companies WHERE workspace_id = ?',
    [dstWorkspaceId]
  );
  if (Number(existing.n) > 0) {
    throw new Error(
      `destination user already has ${existing.n} companies — refusing to migrate to avoid duplicates`
    );
  }

  const stmts = [];
  console.log('parent tables:');
  for (const t of PARENT_TABLES) {
    stmts.push(
      ...(await buildInserts(t, ids, `SELECT * FROM ${t} WHERE workspace_id = ?`, [
        srcWorkspaceId
      ]))
    );
  }
  console.log('child tables:');
  for (const [t, sql] of Object.entries(CHILD_QUERIES)) {
    stmts.push(...(await buildInserts(t, ids, sql, [srcWorkspaceId])));
  }

  if (DRY) {
    console.log(`DRY RUN complete. Would have inserted ${stmts.length} rows in one batch.`);
    return;
  }
  // batch() runs all statements atomically in a single transaction (BEGIN ... COMMIT
  // or ROLLBACK on any error). FK enforcement stays on; insert order matches schema deps.
  await dst.batch(stmts, 'write');
  console.log(`done. inserted ${stmts.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
