/**
 * Tenancy lint.
 *
 * The Scope refactor makes most cross-tenant mistakes a compile error, because
 * every query helper takes a branded Scope instead of two interchangeable
 * strings. But raw SQL inside template literals is invisible to the type
 * checker, and that is exactly where the sweep missed four files:
 * `const userId = locals.user.id` followed by `WHERE p.user_id = ${userId}`
 * type-checks perfectly and silently filters by the wrong column.
 *
 * So: fail the build on any `user_id` filter outside the small set of places
 * where user scoping is genuinely correct.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';

// Files where user_id is legitimately a filter, not a tenancy mistake.
const ALLOW_FILES = new Set([
  'src/lib/server/schema.ts', // column definitions
  'src/lib/server/migrate.ts', // DDL + the backfill itself
  'src/lib/server/auth.ts', // sessions, oauth, password reset — all per-user
  'src/lib/server/workspaces.ts', // membership + authorship reassignment
  'src/lib/server/admin-stats.ts', // instance-wide operator aggregates
  'src/lib/server/scope.ts', // the doc comment
  'src/lib/server/tasks.ts', // SELECTs user_id as an output column, not a filter
  'src/lib/server/reminders-query.ts', // reminders are personal by design
  // API tokens are a personal credential: they authenticate as one user, so a
  // member must only ever see and revoke their own. Filtered on
  // (workspace_id, user_id) together — see PERSONAL_TABLES in migrate.ts.
  'src/lib/server/tokens.ts',
  // A calendar feed's URL is a bearer credential for someone's personal
  // calendar, so feeds are listed per (workspace_id, user_id) — see
  // PERSONAL_TABLES in migrate.ts.
  'src/lib/server/calendar.ts',
  // A calendar feed's URL is a bearer credential for one person's calendar, so
  // ownership is (workspace_id, user_id) — see PERSONAL_TABLES in migrate.ts.
  'src/routes/api/calendar/[id]/+server.ts',
  'src/routes/api/user/+server.ts', // account settings act on the user
  // Allocations carry two user columns. `user_id` is ordinary attribution; the
  // filtered one is `assignee_user_id`, which names whose week is booked and is
  // a genuine owner — "my allocations" is a real query. Every statement still
  // filters workspace_id first. See ASSIGNMENT_COLUMNS in migrate.ts for why
  // those rows are deleted rather than reassigned when a member leaves.
  'src/lib/server/allocations.ts',
  // A time entry belongs to the person who tracked it: "my week" is the primary
  // read, and only its owner (or an admin) may edit it. So user_id here is a
  // real owner rather than attribution. Every statement filters workspace_id
  // first.
  'src/lib/server/time.ts',
  // Outreach templates are the one table where user_id means two different
  // things per row: attribution on a shared template, real ownership on a
  // private one. So listing is (workspace_id AND (shared OR user_id)) — see
  // ROW_PERSONAL in migrate.ts. Every template query lives in this one module
  // precisely so this exemption stays one file wide; don't inline that
  // predicate into a route or a +page.server.ts.
  'src/lib/server/outreach.ts'
]);

// Columns that name a user but are attribution/ownership, not tenancy.
const ATTRIBUTION = /by_user_id|owner_user_id|invited_by_user_id/;

// Tables whose user_id IS the point — membership and invitations are keyed by
// person on purpose, so filtering them by user is correct, not a mistake.
const USER_KEYED_TABLES = /workspaceMembers\.userId|workspaceInvites\.|sessions\.userId/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|svelte)$/.test(full)) out.push(full);
  }
  return out;
}

const problems: string[] = [];
for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, '/');
  if (ALLOW_FILES.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ATTRIBUTION.test(line) || USER_KEYED_TABLES.test(line)) return;
    // Raw SQL filter on user_id, or a drizzle eq() on a .userId column.
    if (/\buser_id\s*=/.test(line) || /eq\(\s*\w+\.userId\s*,/.test(line)) {
      problems.push(`${rel}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (problems.length) {
  console.error('tenancy: found user_id filters that should be workspace_id:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(
    `\n${problems.length} problem(s). Filter by workspace_id, or add the file to ALLOW_FILES ` +
      'in scripts/check-tenancy.ts if user scoping is genuinely correct there.'
  );
  process.exit(1);
}

console.log('tenancy: no stray user_id filters');

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule B: a query that touches a tenant table must filter by workspace.
 *
 * The rule above catches filtering on the *wrong* column. It cannot catch the
 * absence of a filter, which fails exactly as badly.
 *
 * This has to work on whole statements rather than lines. Of the ~130 sql``
 * literals in src/, only about two dozen are executed query bodies; the rest
 * are fragments — ORDER BY clauses, `AND …` predicates, empty sentinels, and
 * the shared column lists in {people,companies}-rows.ts. A line-oriented rule
 * would fire on every one of them. So: only literals that contain both a
 * FROM/JOIN against a tenant table and a WHERE are candidates, which skips
 * fragments for free.
 *
 * The tenant table list comes from TENANT_TABLES in migrate.ts, read as text
 * rather than imported (importing pulls in the db client and its env). Join
 * tables like project_people carry no workspace_id at all and are absent from
 * that list, which is also what clears the handful of correlated EXISTS/IN
 * subqueries that filter through their parent.
 */

const MIGRATE = 'src/lib/server/migrate.ts';
const tenantBlock = readFileSync(MIGRATE, 'utf8').match(
  /export const TENANT_TABLES = \[([\s\S]*?)\]/
);
if (!tenantBlock) {
  console.error(`tenancy: could not read TENANT_TABLES from ${MIGRATE}`);
  process.exit(1);
}
const TENANT = [...tenantBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const TENANT_RE = new RegExp(`\\b(?:FROM|JOIN)\\s+(?:${TENANT.join('|')})\\b`, 'i');

/** Opt out with `// tenancy-ok: <reason>` on the line above the literal. */
const PRAGMA = /\/\/\s*tenancy-ok:/;

const unscoped: string[] = [];
for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, '/');
  if (rel === MIGRATE) continue; // DDL and backfills, by definition unscoped
  const src = readFileSync(file, 'utf8');

  // sql`…` template literals and c.execute(`…`) raw strings alike.
  for (const m of src.matchAll(/(?:sql|execute\(|executeMultiple\()\s*`([\s\S]*?)`/g)) {
    const body = m[1];
    if (!TENANT_RE.test(body)) continue;
    if (!/\bWHERE\b/i.test(body)) continue;
    if (/workspace_id/i.test(body)) continue;
    const before = src.slice(0, m.index ?? 0);
    if (PRAGMA.test(before.slice(before.lastIndexOf('\n', before.lastIndexOf('\n') - 1)))) continue;
    const line = before.split('\n').length;
    unscoped.push(`${rel}:${line}  ${body.trim().replace(/\s+/g, ' ').slice(0, 90)}…`);
  }
}

if (unscoped.length) {
  console.error('tenancy: SQL against a tenant table with no workspace_id filter:\n');
  for (const p of unscoped) console.error('  ' + p);
  console.error(
    `\n${unscoped.length} problem(s). Add the workspace filter, or mark the line above ` +
      'with `// tenancy-ok: <reason>` if the scope genuinely comes from elsewhere.'
  );
  process.exit(1);
}

console.log(`tenancy: ${TENANT.length} tenant tables, every query scoped`);

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule C: a mutating API handler must be explicit about role.
 *
 * The permission line drawn across the API is only as durable as the next
 * endpoint someone adds. This forces the decision to be written down: either
 * call requireRole, or say here why members are allowed.
 *
 * Known limitation: the check is per *file*, not per handler. A file that
 * already calls requireRole anywhere passes, so adding an unguarded DELETE next
 * to a guarded PATCH would not be caught. Making it per-handler needs the
 * allowlist keyed by `path#METHOD`; worth doing if a file ever grows a mix that
 * isn't obvious on sight. Files where the mix is deliberate say so below.
 */

const API_ROOT = 'src/routes/api';

// Routes any workspace member may call, with the reason. Everything else that
// mutates must call requireRole.
const MEMBER_ALLOWED = new Map<string, string>([
  ['collections/+server.ts', 'creating a list is routine CRM work'],
  ['collections/[id]/+server.ts', 'a collection is a saved view, not shared config'],
  ['collections/[id]/items/+server.ts', 'adding a record to a list'],
  ['collections/[id]/sync/+server.ts', 'unlinking your own collection from a pipeline'],
  ['companies/+server.ts', 'routine CRM work'],
  ['companies/[id]/+server.ts', 'routine CRM work'],
  ['import/+server.ts', 'DELETE only discards the staging cookie; POST is role-guarded'],
  ['interactions/+server.ts', 'routine CRM work'],
  ['interactions/[id]/+server.ts', 'routine CRM work'],
  ['interactions/[id]/people/+server.ts', 'linking a person to an interaction'],
  ['people/+server.ts', 'routine CRM work'],
  ['people/[id]/+server.ts', 'routine CRM work'],
  ['pipelines/+server.ts', 'creating a pipeline is routine; deleting one is guarded'],
  ['pipelines/[id]/+server.ts', 'PATCH is routine; DELETE calls requireRole'],
  ['pipelines/[id]/items/+server.ts', 'moving deals through a board is the job'],
  ['pipelines/[id]/items/[itemId]/move/+server.ts', 'moving deals through a board is the job'],
  ['pipelines/[id]/stages/+server.ts', 'add/rename/recolour is routine; reorder and delete call requireRole'],
  ['projects/+server.ts', 'routine CRM work'],
  ['projects/[id]/+server.ts', 'routine CRM work'],
  ['projects/[id]/companies/+server.ts', 'linking records'],
  ['projects/[id]/milestones/+server.ts', "planning a project you can already edit"],
  ['projects/[id]/goals/+server.ts', "planning a project you can already edit"],
  ['projects/[id]/allocations/+server.ts', 'staffing a project is routine work in a small team'],
  ['time/+server.ts', 'logging your own time'],
  ['time/[id]/+server.ts', "your own entries; a colleague's calls requireRole in time.ts"],
  ['time/start/+server.ts', 'starting your own timer'],
  ['time/stop/+server.ts', 'stopping your own timer'],
  [
    'workspace/capacity/+server.ts',
    'your own working week is yours; setting a colleague’s calls requireRole in the handler'
  ],
  ['projects/[id]/interactions/+server.ts', 'linking records'],
  ['projects/[id]/links/+server.ts', 'linking records'],
  ['projects/[id]/people/+server.ts', 'linking records'],
  ['outreach/+server.ts', 'writing a message template is routine CRM work'],
  ['outreach/[id]/+server.ts', 'editing a template you can see; private ones are only ever your own'],
  ['outreach/sent/+server.ts', 'logging outreach you sent yourself'],
  ['reminders/+server.ts', 'reminders are personal'],
  ['reminders/[id]/+server.ts', 'reminders are personal'],
  ['save/+server.ts', 'the bookmarklet entry point; rate-limited instead'],
  ['statuses/+server.ts', 'POST is routine; DELETE calls requireRole'],
  ['tags/+server.ts', 'attaching and detaching a tag on one record'],
  ['tasks/+server.ts', 'tasks are shared and routine'],
  ['tasks/[id]/+server.ts', 'tasks are shared and routine'],
  ['user/+server.ts', 'acts on your own account, re-authenticated by password'],
  ['calendar/+server.ts', 'subscribing your own calendar; feeds are personal'],
  ['calendar/[id]/+server.ts', 'your own feed — every query filters on user_id too'],
  // /api/v1 mirrors the internal CRM endpoints above, so it inherits their
  // reasoning: creating and editing records is routine member work. What is
  // *different* is that these are additionally scope-gated (requireApiScope)
  // and rate-limited per token, neither of which applies to a cookie session.
  ['v1/people/+server.ts', 'routine CRM work; token additionally needs the write scope'],
  ['v1/people/[id]/+server.ts', 'routine CRM work; token additionally needs the write scope'],
  ['v1/companies/+server.ts', 'routine CRM work; token additionally needs the write scope'],
  ['v1/capture/+server.ts', 'the extension entry point; capture-scoped and rate-limited instead'],
  ['v1/tokens/+server.ts', 'manages your own credentials, cookie-session only'],
  ['v1/tokens/[id]/+server.ts', 'manages your own credentials, cookie-session only'],
  ['workspace/switch/+server.ts', 'membership is checked inside switchWorkspace'],
  ['workspace/members/+server.ts', 'GET only'],
  ['workspace/+server.ts', 'POST creates your own workspace; PATCH and DELETE call requireRole']
]);

const MUTATING = /export const (POST|PATCH|PUT|DELETE)\b/;

const ungoverned: string[] = [];
for (const file of walk(API_ROOT)) {
  const rel = file.replace(/\\/g, '/');
  const src = readFileSync(file, 'utf8');
  if (!MUTATING.test(src)) continue;
  if (/requireRole\s*\(/.test(src)) continue;
  const key = rel.slice(API_ROOT.length + 1);
  if (MEMBER_ALLOWED.has(key)) continue;
  ungoverned.push(rel);
}

if (ungoverned.length) {
  console.error('tenancy: mutating endpoints with no role decision:\n');
  for (const p of ungoverned) console.error('  ' + p);
  console.error(
    `\n${ungoverned.length} problem(s). Call requireRole(s, 'owner', 'admin'), or add the ` +
      'route to MEMBER_ALLOWED in scripts/check-tenancy.ts with the reason members may call it.'
  );
  process.exit(1);
}

console.log(`tenancy: ${MEMBER_ALLOWED.size} member-allowed routes, rest role-guarded`);
