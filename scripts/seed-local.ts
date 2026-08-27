/**
 * Seed a local database for hands-on testing. Not part of the app or CI.
 *
 * Calls the app's own code rather than writing rows by hand, for the same
 * reason `e2e/seed.ts` does: a `Scope` is branded and cannot be faked, and rows
 * written directly would drift from what `savePerson` actually stores.
 *
 *   DATABASE_URL=file:./data/heli.db npx tsx scripts/seed-local.ts
 *
 * Safe to re-run only against a fresh file — it registers a fixed account and
 * will fail on the second run rather than duplicating anything.
 */
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Refuses to touch a database that already exists.
 *
 * The obvious default here is `./data/heli.db`, which is exactly the path a
 * self-host deployment uses (`.env.example`, `README.md`) — so the obvious
 * default is also the one that writes eighteen invented people and a
 * `you@local.test` account into somebody's real workspace. Existence is the
 * check that catches that whatever path you point it at.
 */
const DB = process.env.DATABASE_URL ?? 'file:./data/heli-dev.db';
const filePath = DB.startsWith('file:') ? DB.slice('file:'.length) : null;
if (filePath && existsSync(filePath)) {
  console.error(
    `refusing to seed ${filePath}: it already exists.\n` +
      'Delete it first, or point DATABASE_URL at a new file.'
  );
  process.exit(1);
}
process.env.DATABASE_URL = DB;
mkdirSync('./data', { recursive: true });

// Nothing here should reach the network while seeding.
process.env.SCHEDULER_DISABLED = '1';

const EMAIL = 'you@local.test';
const PASSWORD = 'correct-horse-battery-staple';

async function main() {
  const { migrate } = await import('../src/lib/server/migrate');
  await migrate();

  const { register } = await import('../src/lib/server/auth');
  const { requireScope } = await import('../src/lib/server/scope');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { createCollection, addToCollection } = await import('../src/lib/server/collections');
  const { ensureTag, attachTag } = await import('../src/lib/server/tags');
  const { createStatus } = await import('../src/lib/server/statuses');
  const { db } = await import('../src/lib/server/db');
  const { people, companies } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  const { user } = await register({ email: EMAIL, password: PASSWORD, username: 'you' });
  const s = requireScope({ user, sessionId: null } as never);

  const FIRST = ['Ada', 'Alan', 'Grace', 'Katherine', 'Barbara', 'Edsger', 'Donald', 'Margaret',
    'Radia', 'Leslie', 'Frances', 'Jean', 'Annie', 'Adele', 'Karen', 'Shafi', 'Lynn', 'Sophie'];
  const LAST = ['Lovelace', 'Turing', 'Hopper', 'Johnson', 'Liskov', 'Dijkstra', 'Knuth',
    'Hamilton', 'Perlman', 'Lamport', 'Allen', 'Bartik', 'Easley', 'Goldberg', 'Sparck Jones',
    'Goldwasser', 'Conway', 'Wilson'];
  const ROLES = ['Founder', 'CTO', 'Engineer', 'Designer', 'Investor', 'Advisor', 'Head of Ops'];

  const companyIds: string[] = [];
  for (const name of ['Acme Corp', 'Beta Industries', 'Gamma Labs', 'Delta Systems',
    'Epsilon Works', 'Zeta Robotics', 'Northwind Trading', 'Initech']) {
    companyIds.push((await saveCompany(s, null, { name, industry: 'Software' })).id);
  }

  // Statuses, so the status filter has something to narrow by.
  const lead = await createStatus('person', s, { name: 'Lead', tone: 'blue' });
  const won = await createStatus('person', s, { name: 'Won', tone: 'green' });

  const tagInvestor = await ensureTag(s, 'person', 'Investor');
  const tagWarm = await ensureTag(s, 'person', 'Warm intro');
  const tagSupplier = await ensureTag(s, 'company', 'Supplier');

  // 70 people: more than the 50-row page, so Load More and "select every loaded
  // row" are both reachable — which is where a selection outgrows a URL and the
  // POST export path matters.
  const personIds: string[] = [];
  for (let i = 0; i < 70; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}${i > 17 ? ` ${i}` : ''}`;
    const id = (
      await savePerson(s, null, {
        name,
        role: ROLES[i % ROLES.length],
        email: `person${i}@example.com`,
        companyId: companyIds[i % companyIds.length]
      })
    ).id;
    personIds.push(id);

    await db(s.region)
      .update(people)
      .set({
        priority: i % 4 === 0 ? 1 : i % 4 === 1 ? 2 : i % 4 === 2 ? 3 : null,
        statusId: i % 5 === 0 ? lead.id : i % 5 === 1 ? won.id : null,
        isFavorite: i % 9 === 0 ? 1 : 0,
        // A few archived, so "Export all" vs the archived filter is visible.
        isArchived: i % 17 === 0 && i > 0 ? 1 : 0
      })
      .where(eq(people.id, id));

    if (i % 6 === 0) await attachTag(s, 'person', id, tagInvestor.id);
    if (i % 8 === 0) await attachTag(s, 'person', id, tagWarm.id);
  }

  await db(s.region).update(companies).set({ isFavorite: 1 }).where(eq(companies.id, companyIds[0]));
  await attachTag(s, 'company', companyIds[0], tagSupplier.id);

  // A collection with both kinds — the merged-CSV case and the kind-scoped label.
  const mixed = await createCollection(s, {
    name: 'Q3 targets',
    description: 'People and companies to reach this quarter.'
  });
  for (const id of personIds.slice(0, 9)) await addToCollection(s, mixed.id, 'person', id);
  for (const id of companyIds.slice(0, 4)) await addToCollection(s, mixed.id, 'company', id);

  // People only, so the label reads "Export N people" with no companies to hide.
  const peopleOnly = await createCollection(s, { name: 'Warm intros' });
  for (const id of personIds.slice(10, 16)) await addToCollection(s, peopleOnly.id, 'person', id);

  // Empty, which is the only state that renders the Add button twice — the
  // double-popover bug lived exactly here.
  const empty = await createCollection(s, { name: 'Empty list' });

  console.log(
    JSON.stringify(
      {
        db: DB,
        email: EMAIL,
        password: PASSWORD,
        people: personIds.length,
        companies: companyIds.length,
        collections: { mixed: mixed.id, peopleOnly: peopleOnly.id, empty: empty.id }
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
