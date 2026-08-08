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
  'src/routes/api/user/+server.ts' // account settings act on the user
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
