/**
 * Mint a pairing code against a local database, for developing the mobile app.
 *
 * Pairing normally starts in Settings → Devices, which is correct for real use
 * and tedious in a loop where you reinstall the app twenty times an afternoon.
 * This is the same `createPairing` the endpoint calls, so it exercises the real
 * path rather than a shortcut around it.
 *
 *   DB_PATH=/tmp/heli-dev/dev.db npx tsx scripts/dev-pair.ts
 *
 * Refuses to run against the default database, for the same reason
 * `seed-dev.ts` does: this prints a live credential to a terminal.
 */
import { initDb, db } from '../src/lib/server/db';
import { users, workspaces, workspaceMembers } from '../src/lib/server/schema';
import { requireScope } from '../src/lib/server/scope';
import { createPairing, PAIRING_TTL_MS } from '../src/lib/server/devices';
import { eq } from 'drizzle-orm';

const email = process.argv[2] ?? 'demo@example.com';

if (!process.env.DB_PATH) {
  console.error('dev-pair: set DB_PATH to a disposable database first.');
  process.exit(1);
}

await initDb();
const region = 'local';
const d = db(region);

const user = await d.select().from(users).where(eq(users.email, email)).get();
if (!user) {
  console.error(`dev-pair: no account for ${email}. Run scripts/seed-dev.ts first.`);
  process.exit(1);
}

const membership = await d
  .select()
  .from(workspaceMembers)
  .where(eq(workspaceMembers.userId, user.id))
  .get();
if (!membership) {
  console.error('dev-pair: that account is in no workspace.');
  process.exit(1);
}

const workspace = await d
  .select()
  .from(workspaces)
  .where(eq(workspaces.id, membership.workspaceId))
  .get();

// The branded Scope can only come from requireScope, so build the locals shape
// it expects — the same thing tests/helpers/fixtures.ts does.
const scope = requireScope({
  user: {
    id: user.id,
    email: user.email,
    username: user.username,
    region,
    workspaceId: membership.workspaceId,
    workspaceName: workspace?.name ?? 'Workspace',
    role: membership.role
  },
  sessionId: null,
  token: null
} as unknown as App.Locals);

const { code } = await createPairing(scope);

console.log(`\n  ${code}\n`);
console.log(`  Enter that in the app. Valid for ${PAIRING_TTL_MS / 1000}s, once.`);
console.log(`  Account: ${email} · workspace: ${workspace?.name ?? '—'}\n`);
