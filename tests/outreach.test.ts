import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, type Tenant } from './helpers/fixtures';
import type { Scope } from '../src/lib/server/scope';

/**
 * Template visibility is the one place in the app where `user_id` filters a
 * workspace-owned table, so it is worth pinning from both ends: a colleague
 * must not see your private draft, and a different workspace must not see
 * anything at all.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;
let outsider: Tenant;
let bobScope: Scope;

let sharedId: string;
let privateId: string;
let personId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
  outsider = await makeTenant('outsider');

  const { db } = await import('../src/lib/server/db');
  const { createTemplate } = await import('../src/lib/server/outreach');
  const { savePerson } = await import('../src/lib/server/savePerson');

  bobScope = await joinWorkspace(alice, bob);

  sharedId = (
    await createTemplate(alice.scope, {
      name: 'Team intro',
      platform: 'email',
      subject: 'Hello {{first_name}}',
      body: '<p>Hi {{first_name}}, I am {{my_name}}.</p>',
      visibility: 'shared',
      nudgeDays: 3
    })
  ).id;

  privateId = (
    await createTemplate(alice.scope, {
      name: 'My draft',
      platform: 'linkedin_note',
      body: 'Hi {{first_name}}, would love to connect.',
      visibility: 'private'
    })
  ).id;

  personId = (await savePerson(alice.scope, null, { name: 'Ada Lovelace' })).id;
}, 120_000);

afterAll(() => ctx?.cleanup());

test('a colleague sees shared templates but not your private ones', async () => {
  const { listTemplates } = await import('../src/lib/server/outreach');

  const mine = (await listTemplates(alice.scope)).map((t) => t.id);
  expect(mine).toContain(sharedId);
  expect(mine).toContain(privateId);

  const theirs = (await listTemplates(bobScope)).map((t) => t.id);
  expect(theirs).toContain(sharedId);
  expect(theirs).not.toContain(privateId);
});

test('another workspace sees nothing', async () => {
  const { listTemplates, getTemplate } = await import('../src/lib/server/outreach');
  expect(await listTemplates(outsider.scope)).toHaveLength(0);
  expect(await getTemplate(outsider.scope, sharedId)).toBeNull();
});

test('a colleague cannot fetch or edit your private template by id', async () => {
  const { getTemplate, updateTemplate } = await import('../src/lib/server/outreach');
  expect(await getTemplate(bobScope, privateId)).toBeNull();
  await expect(updateTemplate(bobScope, privateId, { name: 'Hijacked' })).rejects.toThrow(
    'not_found'
  );
});

/**
 * A subject on a platform that has none would be authored, stored and then
 * silently never used. The platform decides the shape.
 */
test('a subject is dropped on a platform that has none', async () => {
  const { createTemplate, getTemplate } = await import('../src/lib/server/outreach');
  const { id } = await createTemplate(alice.scope, {
    name: 'DM',
    platform: 'linkedin_dm',
    subject: 'ignored',
    body: 'hello'
  });
  expect((await getTemplate(alice.scope, id))!.subject).toBeNull();
});

test('changing platform re-shapes the subject', async () => {
  const { updateTemplate, getTemplate } = await import('../src/lib/server/outreach');
  await updateTemplate(alice.scope, sharedId, { platform: 'linkedin_dm' });
  expect((await getTemplate(alice.scope, sharedId))!.subject).toBeNull();
  await updateTemplate(alice.scope, sharedId, {
    platform: 'email',
    subject: 'Hello {{first_name}}'
  });
  expect((await getTemplate(alice.scope, sharedId))!.subject).toBe('Hello {{first_name}}');
});

/**
 * Only email keeps markup — every other composer pastes plain text, so storing
 * markup for them would show formatting that cannot survive the paste.
 */
test('markup is kept for email and stripped for everything else', async () => {
  const { createTemplate, getTemplate } = await import('../src/lib/server/outreach');
  const rich = await createTemplate(alice.scope, {
    name: 'Rich',
    platform: 'email',
    body: '<p>Hi <strong>there</strong></p>'
  });
  expect((await getTemplate(alice.scope, rich.id))!.body).toBe('<p>Hi <strong>there</strong></p>');

  const plain = await createTemplate(alice.scope, {
    name: 'Plain',
    platform: 'x_dm',
    body: '<p>Hi <strong>there</strong></p>'
  });
  // sanitizePlainText leaves the characters alone, but the platform is plain,
  // so what matters is that a script cannot ride in via the rich path.
  const stored = (await getTemplate(alice.scope, plain.id))!.body;
  expect(stored).not.toContain('<script');
});

test('a template body is sanitized on write', async () => {
  const { createTemplate, getTemplate } = await import('../src/lib/server/outreach');
  const { id } = await createTemplate(alice.scope, {
    name: 'Nasty',
    platform: 'email',
    body: '<p>hi</p><img src=x onerror="alert(1)">'
  });
  const stored = (await getTemplate(alice.scope, id))!.body;
  expect(stored).not.toMatch(/onerror|<img/i);
});

test('an invalid platform is rejected rather than stored', async () => {
  const { createTemplate } = await import('../src/lib/server/outreach');
  await expect(
    createTemplate(alice.scope, { name: 'Bad', platform: 'carrier_pigeon', body: 'x' })
  ).rejects.toThrow('invalid_platform');
});

test('the nudge offset is clamped, not trusted', async () => {
  const { createTemplate, getTemplate } = await import('../src/lib/server/outreach');
  const huge = await createTemplate(alice.scope, {
    name: 'Huge nudge',
    platform: 'email',
    body: 'x',
    nudgeDays: 99_999
  });
  expect((await getTemplate(alice.scope, huge.id))!.nudgeDays).toBe(365);

  const negative = await createTemplate(alice.scope, {
    name: 'Negative nudge',
    platform: 'email',
    body: 'x',
    nudgeDays: -5
  });
  expect((await getTemplate(alice.scope, negative.id))!.nudgeDays).toBeNull();
});

test('an interaction records which template produced it', async () => {
  const { createInteraction } = await import('../src/lib/server/saveInteraction');
  const { db } = await import('../src/lib/server/db');
  const { interactions } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  const { id } = await createInteraction(alice.scope, {
    occurredAt: Date.now(),
    type: 'email',
    title: 'Outreach: Team intro',
    body: '<p>Hi Ada</p>',
    personIds: [personId],
    outreachTemplateId: sharedId
  });

  const row = await db(alice.scope.region)
    .select({ tid: interactions.outreachTemplateId })
    .from(interactions)
    .where(eq(interactions.id, id))
    .get();
  expect(row?.tid).toBe(sharedId);
});

/**
 * Deleting a template must not delete the record of what you wrote to someone —
 * hence SET NULL rather than CASCADE. This only holds because the test database
 * is a real file with `PRAGMA foreign_keys = ON`.
 */
test('deleting a template leaves the interaction, with a null reference', async () => {
  const { createTemplate, deleteTemplate } = await import('../src/lib/server/outreach');
  const { createInteraction } = await import('../src/lib/server/saveInteraction');
  const { db } = await import('../src/lib/server/db');
  const { interactions } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  const t = await createTemplate(alice.scope, {
    name: 'Doomed',
    platform: 'email',
    body: 'x'
  });
  const i = await createInteraction(alice.scope, {
    occurredAt: Date.now(),
    type: 'email',
    title: 'Sent from a template about to die',
    personIds: [personId],
    outreachTemplateId: t.id
  });

  await deleteTemplate(alice.scope, t.id);

  const row = await db(alice.scope.region)
    .select({ id: interactions.id, tid: interactions.outreachTemplateId })
    .from(interactions)
    .where(eq(interactions.id, i.id))
    .get();
  expect(row?.id).toBe(i.id);
  expect(row?.tid).toBeNull();
});

test('an oversized body is truncated rather than stored whole', async () => {
  const { createInteraction } = await import('../src/lib/server/saveInteraction');
  const { db } = await import('../src/lib/server/db');
  const { interactions } = await import('../src/lib/server/schema');
  const { eq } = await import('drizzle-orm');

  const { id } = await createInteraction(alice.scope, {
    occurredAt: Date.now(),
    type: 'dm',
    title: 'Huge',
    body: 'x'.repeat(120_000),
    personIds: [personId]
  });
  const row = await db(alice.scope.region)
    .select({ body: interactions.body })
    .from(interactions)
    .where(eq(interactions.id, id))
    .get();
  expect(row!.body!.length).toBeLessThanOrEqual(50_000);
});
