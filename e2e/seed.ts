/**
 * A throwaway database with a known session, built by calling the app's own
 * code rather than writing rows by hand — the same discipline as
 * `tests/helpers/fixtures.ts`. A `Scope` is branded and cannot be faked, and a
 * session written directly would drift from whatever `register()` actually
 * does.
 *
 * The session id is handed to Playwright as a cookie. That is the whole reason
 * this file exists: there is no other way into an authenticated page, and
 * driving the sign-in form would make every spec depend on the auth UI.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Seeded = {
  dbPath: string;
  sessionId: string;
  /** A second account, joined to the same workspace with the `member` role. */
  memberSessionId: string;
  collectionId: string;
};

export async function seed(): Promise<Seeded> {
  const dir = mkdtempSync(join(tmpdir(), 'heli-e2e-'));
  const dbPath = join(dir, 'e2e.db');
  // Set before the first import of db.ts: PRIMARY_REGION is a module-load
  // constant, exactly as `tests/helpers/testDb.ts` documents.
  process.env.DATABASE_URL = `file:${dbPath}`;

  const { migrate } = await import('../src/lib/server/migrate');
  await migrate();

  const { register } = await import('../src/lib/server/auth');
  const { requireScope } = await import('../src/lib/server/scope');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { createTemplate } = await import('../src/lib/server/outreach');
  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');

  const { user, sessionId } = await register({
    email: 'e2e@example.com',
    password: 'correct-horse-battery-staple',
    username: 'e2e'
  });
  const s = requireScope({ user, sessionId: null } as never);

  // Six people, so a shift-range has somewhere to go and the counts in the
  // assertions are not ambiguous.
  const personIds: Record<string, string> = {};
  const companyIds: Record<string, string> = {};

  for (const [name, role] of [
    ['Ada Lovelace', 'Mathematician'],
    ['Barbara Liskov', 'Professor'],
    ['Alan Turing', 'Cryptanalyst'],
    ['Katherine Johnson', 'Physicist'],
    ['Grace Hopper', 'Rear Admiral'],
    ['Edsger Dijkstra', 'Professor']
  ] as const) {
    personIds[name] = (
      await savePerson(s, null, {
        name,
        role,
        email: `${name.split(' ')[0].toLowerCase()}@example.com`
      })
    ).id;
  }
  for (const name of ['Acme Corp', 'Beta Industries', 'Gamma Labs']) {
    companyIds[name] = (await saveCompany(s, null, { name })).id;
  }

  await createTemplate(s, {
    name: 'Person intro',
    platform: 'email',
    subject: 'Hi {{first_name}}',
    body: '<p>Hi {{first_name}}.</p>'
  });
  await createTemplate(s, {
    name: 'Company intro',
    platform: 'email',
    target: 'company',
    subject: 'About {{company_name}}',
    body: '<p>Saw {{domain}}.</p>'
  });

  /**
   * A collection holding both kinds, with a tag on one of each — enough for the
   * detail page's kind filter, its search (which matches tag names too) and the
   * card view's chips.
   */
  const { id: collectionId } = await createCollection(s, { name: 'Q3 targets' });
  for (const [kind, refId] of [
    ['person', personIds['Ada Lovelace']],
    ['person', personIds['Grace Hopper']],
    ['company', companyIds['Acme Corp']]
  ] as const) {
    await addToCollection(s, collectionId, kind, refId);
  }
  /**
   * A colleague with the plain `member` role, in the same workspace.
   *
   * Export used to be owner/admin only. Dropping that gate is the one change
   * here that alters who can do what in production, and the gate lived in the
   * route — which the server-side suite never calls, because it calls helpers.
   * So a member session is the only way to assert the new rule at all.
   */
  const member = await register({
    email: 'member@example.com',
    password: 'correct-horse-battery-staple',
    username: 'member'
  });
  const { db } = await import('../src/lib/server/db');
  const { workspaceMembers, sessions } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');
  await db(s.region).insert(workspaceMembers).values({
    workspaceId: s.workspaceId,
    userId: member.user.id,
    role: 'member',
    createdAt: Date.now()
  });
  /**
   * Point the session at *this* workspace, not the one `register` gave them.
   *
   * Without this the member signs in to a workspace of their own where they are
   * the owner, and every "can a member do X" assertion passes for the wrong
   * reason — which is exactly what happened the first time this was written.
   */
  await db(s.region)
    .update(sessions)
    .set({ activeWorkspaceId: s.workspaceId })
    .where(eq(sessions.id, member.sessionId));

  const pioneer = await ensureTag(s, 'person', 'Pioneer');
  const supplier = await ensureTag(s, 'company', 'Supplier');
  await attachTag(s, 'person', personIds['Ada Lovelace'], pioneer.id);
  await attachTag(s, 'company', companyIds['Acme Corp'], supplier.id);

  return { dbPath, sessionId, memberSessionId: member.sessionId, collectionId };
}

// Run directly (`tsx e2e/seed.ts`) to emit the config the server and specs need.
if (process.argv[1]?.endsWith('seed.ts')) {
  seed().then((r) => console.log(JSON.stringify(r)));
}
