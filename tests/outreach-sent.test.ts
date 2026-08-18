import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * `/api/outreach/sent` used to hard-require a `personId`, which is the one
 * thing that blocked company outreach — the write path underneath it already
 * took a `companyId`.
 *
 * The mismatch check is the interesting assertion. `interactions.
 * outreach_template_id` is the only provenance an outreach message leaves
 * behind, so a company template logged against a person would make that record
 * say something untrue and nothing downstream would catch it.
 */

let ctx: TestDb;
let alice: Tenant;
let personTemplateId: string;
let companyTemplateId: string;
let adaId: string;
let acmeId: string;

function eventFor(tenant: Tenant, body: unknown) {
  return {
    request: new Request('http://localhost/api/outreach/sent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { user: tenant.user, sessionId: null }
  } as never;
}

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');

  const { createTemplate } = await import('../src/lib/server/outreach');
  const { savePerson } = await import('../src/lib/server/savePerson');
  const { saveCompany } = await import('../src/lib/server/saveCompany');

  personTemplateId = (
    await createTemplate(alice.scope, {
      name: 'Person intro',
      platform: 'email',
      subject: 'Hi',
      body: '<p>Hello.</p>',
      nudgeDays: 3
    })
  ).id;
  companyTemplateId = (
    await createTemplate(alice.scope, {
      name: 'Company intro',
      platform: 'email',
      target: 'company',
      subject: 'Hello there',
      body: '<p>About {{company_name}}.</p>',
      nudgeDays: 5
    })
  ).id;

  adaId = (await savePerson(alice.scope, null, { name: 'Ada Lovelace' })).id;
  acmeId = (await saveCompany(alice.scope, null, { name: 'Acme Corp' })).id;
});

test('a company send logs against the company, with no interaction_people row', async () => {
  const { POST } = await import('../src/routes/api/outreach/sent/+server');
  const res = await POST(
    eventFor(alice, {
      templateId: companyTemplateId,
      companyId: acmeId,
      subject: 'Hello there',
      body: '<p>About Acme Corp.</p>'
    })
  );
  expect(res.status).toBe(201);
  const { id, reminderId } = (await res.json()) as { id: string; reminderId: string | null };

  const { db } = await import('../src/lib/server/db');
  const { interactions, interactionPeople, reminders } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  const row = await db(alice.scope.region)
    .select()
    .from(interactions)
    .where(eq(interactions.id, id))
    .get();
  expect(row?.companyId).toBe(acmeId);
  expect(row?.outreachTemplateId).toBe(companyTemplateId);
  // The subject becomes the title on platforms that have one.
  expect(row?.title).toBe('Hello there');

  const links = await db(alice.scope.region)
    .select()
    .from(interactionPeople)
    .where(eq(interactionPeople.interactionId, id));
  expect(links).toEqual([]);

  // `REMINDER_KINDS` already carried 'company' — no schema change was needed.
  expect(reminderId).toBeTruthy();
  const nudge = await db(alice.scope.region)
    .select()
    .from(reminders)
    .where(eq(reminders.id, reminderId!))
    .get();
  expect(nudge?.kind).toBe('company');
  expect(nudge?.refId).toBe(acmeId);
});

test('the person path still works unchanged', async () => {
  const { POST } = await import('../src/routes/api/outreach/sent/+server');
  const res = await POST(
    eventFor(alice, { templateId: personTemplateId, personId: adaId, subject: 'Hi', body: 'x' })
  );
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };

  const { db } = await import('../src/lib/server/db');
  const { interactionPeople } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');
  const links = await db(alice.scope.region)
    .select()
    .from(interactionPeople)
    .where(eq(interactionPeople.interactionId, id));
  expect(links.map((l) => l.personId)).toEqual([adaId]);
});

test('exactly one recipient is required', async () => {
  const { POST } = await import('../src/routes/api/outreach/sent/+server');

  await expect(POST(eventFor(alice, { templateId: personTemplateId }))).rejects.toMatchObject({
    status: 400
  });
  await expect(
    POST(eventFor(alice, { templateId: personTemplateId, personId: adaId, companyId: acmeId }))
  ).rejects.toMatchObject({ status: 400 });
});

test('the recipient must match the template target', async () => {
  const { POST } = await import('../src/routes/api/outreach/sent/+server');

  await expect(
    POST(eventFor(alice, { templateId: companyTemplateId, personId: adaId, body: 'x' }))
  ).rejects.toMatchObject({ status: 400 });

  await expect(
    POST(eventFor(alice, { templateId: personTemplateId, companyId: acmeId, body: 'x' }))
  ).rejects.toMatchObject({ status: 400 });
});
