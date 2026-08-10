/**
 * Seed a throwaway database with enough data to actually look at the UI.
 *
 * "Verify UI changes by running the feature in a browser" is the project's
 * stated quality bar, and an empty database renders empty states — which is
 * exactly the wrong thing to be looking at when you have just rewritten every
 * popover in the app. Twenty people across six companies, statuses, tags,
 * interactions, projects, a collection, and a four-stage pipeline is enough to
 * exercise the list pages, the cell popovers and the board.
 *
 * Always point DB_PATH somewhere disposable — this registers a known-password
 * account and the script refuses to run against the default path.
 *
 *   DB_PATH=/tmp/heli-dev/dev.db npx tsx scripts/seed-dev.ts
 *   DB_PATH=/tmp/heli-dev/dev.db ENABLE_REGISTRATION=1 npm run dev
 */
import { createId } from '@paralleldrive/cuid2';
import { initDb, db } from '../src/lib/server/db';
import { migrate } from '../src/lib/server/migrate';
import { register } from '../src/lib/server/auth';
import { requireScope, type Scope } from '../src/lib/server/scope';
import { savePerson } from '../src/lib/server/savePerson';
import { saveCompany } from '../src/lib/server/saveCompany';
import { createInteraction } from '../src/lib/server/saveInteraction';
import { createPipeline, addStage, addItemToPipeline } from '../src/lib/server/pipelines';
import { createCollection } from '../src/lib/server/collections';
import { createStatus } from '../src/lib/server/statuses';
import { ensureTag, attachTag } from '../src/lib/server/tags';
import { projects } from '../src/lib/server/schema';

const EMAIL = 'demo@example.com';
const PASSWORD = 'demo-password-123';

if (!process.env.DB_PATH || process.env.DB_PATH.includes('data/heli.db')) {
  console.error('seed-dev: set DB_PATH to a disposable file first — this creates a known-password account.');
  process.exit(1);
}

await initDb();
await migrate();

const { user } = await register({ email: EMAIL, password: PASSWORD, username: 'demo' });
const s: Scope = requireScope({ user, sessionId: null } as unknown as App.Locals);

const NAMES = [
  'Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson',
  'Barbara Liskov', 'Donald Knuth', 'Margaret Hamilton', 'Linus Torvalds',
  'Radia Perlman', 'Vint Cerf', 'Anita Borg', 'Ken Thompson',
  'Jean Bartik', 'Tim Berners-Lee', 'Frances Allen', 'Bjarne Stroustrup',
  'Shafi Goldwasser', 'Leslie Lamport', 'Sophie Wilson', 'Guido van Rossum'
];
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli'];
const ROLES = ['Engineer', 'Founder', 'Designer', 'CTO'];
const TONES = [
  ['Lead', 'blue'],
  ['Qualified', 'green'],
  ['Cold', 'gray'],
  ['Churned', 'red']
] as const;

const companyIds: string[] = [];
for (const name of COMPANIES) {
  const c = await saveCompany(s, null, { name, industry: 'Software', location: 'Amsterdam' });
  companyIds.push(c.id);
}

for (const [name, tone] of TONES) {
  await createStatus('person', s, { name, tone });
  await createStatus('company', s, { name, tone });
}

const tag = await ensureTag(s, 'person', 'vip');

const personIds: string[] = [];
for (let i = 0; i < NAMES.length; i++) {
  const p = await savePerson(s, null, {
    name: NAMES[i],
    role: ROLES[i % ROLES.length],
    companyId: companyIds[i % companyIds.length],
    email: `${NAMES[i].toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    location: 'Amsterdam'
  });
  personIds.push(p.id);
  if (i % 3 === 0) await attachTag(s, 'person', p.id, tag.id);
}

for (let i = 0; i < 12; i++) {
  await createInteraction(s, {
    type: (['call', 'email', 'meeting', 'note'] as const)[i % 4],
    title: `Conversation ${i + 1}`,
    body: 'Some notes from the conversation.',
    occurredAt: Date.now() - i * 86_400_000,
    personIds: [personIds[i % personIds.length]],
    companyId: companyIds[i % companyIds.length]
  });
}

const now = Date.now();
for (const name of ['Website rebuild', 'Series A', 'Q4 launch']) {
  await db(s.region).insert(projects).values({
    id: createId(),
    workspaceId: s.workspaceId,
    userId: s.userId,
    name,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    endDate: now + 5 * 86_400_000
  });
}

await createCollection(s, { name: 'Warm intros', description: 'People to reach out to' });

const pipe = await createPipeline(s, { name: 'Sales', initialStages: [] });
const stages: { id: string }[] = [];
for (const [name, color] of [
  ['New', 'gray'],
  ['Contacted', 'sky'],
  ['Won', 'green'],
  ['Lost', 'red']
] as const) {
  stages.push(await addStage(s, pipe.id, { name, color }));
}
for (let i = 0; i < 6; i++) {
  await addItemToPipeline(s, pipe.id, {
    kind: 'person',
    refId: personIds[i],
    stageId: stages[i % stages.length].id
  });
}

console.log(`seed-dev: ready — sign in as ${EMAIL} / ${PASSWORD}`);
process.exit(0);
