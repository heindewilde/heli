import { beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Company outreach turns on one column with a default. The test that matters
 * most is the least obvious: a row written *before* that column existed has to
 * read back as a person template, and it is the `DEFAULT 'person'` in the ALTER
 * that makes that true rather than a coercion someone has to remember.
 */

let ctx: TestDb;
let alice: Tenant;
let outsider: Tenant;

let personTemplateId: string;
let companyTemplateId: string;
let acmeId: string;
let betaId: string;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  outsider = await makeTenant('outsider');

  const { createTemplate } = await import('../src/lib/server/outreach');
  const { saveCompany } = await import('../src/lib/server/saveCompany');

  personTemplateId = (
    await createTemplate(alice.scope, {
      name: 'Person intro',
      platform: 'email',
      subject: 'Hi {{first_name}}',
      body: '<p>Hello {{first_name}}.</p>',
      visibility: 'shared'
    })
  ).id;

  companyTemplateId = (
    await createTemplate(alice.scope, {
      name: 'Company intro',
      platform: 'email',
      target: 'company',
      subject: 'About {{company_name}}',
      body: '<p>Saw {{domain}} — we work with other {{industry}} teams.</p>',
      visibility: 'shared'
    })
  ).id;

  acmeId = (await saveCompany(alice.scope, null, { name: 'Acme Corp' })).id;
  betaId = (await saveCompany(alice.scope, null, { name: 'Beta Ltd' })).id;
});

test('target defaults to person and round-trips', async () => {
  const { getTemplate } = await import('../src/lib/server/outreach');
  expect((await getTemplate(alice.scope, personTemplateId))?.target).toBe('person');
  expect((await getTemplate(alice.scope, companyTemplateId))?.target).toBe('company');
});

/**
 * This is the migration assertion, written the way a pre-existing row would
 * actually arrive: an INSERT that never mentions `target` at all.
 */
test('a row inserted without target reads back as a person template', async () => {
  const { db } = await import('../src/lib/server/db');
  const { sql } = await import('drizzle-orm');
  const { getTemplate } = await import('../src/lib/server/outreach');

  const now = Date.now();
  await db(alice.scope.region).run(sql`
    INSERT INTO outreach_templates
      (id, workspace_id, user_id, name, platform, body, visibility, is_archived, created_at, updated_at)
    VALUES
      ('legacy1', ${alice.scope.workspaceId}, ${alice.scope.userId}, 'Legacy', 'email', 'hi', 'shared', 0, ${now}, ${now})
  `); // tenancy-ok: writes workspace_id explicitly; this is the pre-column shape under test

  expect((await getTemplate(alice.scope, 'legacy1'))?.target).toBe('person');
});

test('listTemplates narrows by target', async () => {
  const { listTemplates, countTemplates } = await import('../src/lib/server/outreach');

  const companies = await listTemplates(alice.scope, { target: 'company' });
  expect(companies.map((t) => t.id)).toEqual([companyTemplateId]);

  const people = await listTemplates(alice.scope, { target: 'person' });
  expect(people.map((t) => t.id).sort()).toEqual([personTemplateId, 'legacy1'].sort());

  expect(await countTemplates(alice.scope, { target: 'company' })).toBe(1);
});

test('summaries carry the target, so the palette can label them', async () => {
  const { listTemplateSummaries } = await import('../src/lib/server/outreach');
  const rows = await listTemplateSummaries(alice.scope, {});
  expect(rows.find((r) => r.id === companyTemplateId)?.target).toBe('company');
  // Still a projection — no body over the wire on every authenticated request.
  expect(Object.keys(rows[0]).sort()).toEqual(['id', 'name', 'platform', 'target']);
});

test('a company collection resolves to company recipients', async () => {
  const { createCollection, addManyToCollection } = await import('../src/lib/server/collections');
  const { collectionCompanyRecipients, collectionRecipients } = await import(
    '../src/lib/server/outreach-recipients'
  );
  const { id } = await createCollection(alice.scope, { name: 'Targets' });
  await addManyToCollection(alice.scope, id, 'company', [acmeId, betaId]);

  const found = await collectionCompanyRecipients(alice.scope, id);
  expect(found?.members.map((m) => m.name)).toEqual(['Acme Corp', 'Beta Ltd']);
  // Stamped server-side, because `buildVariables` narrows on it.
  expect(found?.members.every((m) => m.kind === 'company')).toBe(true);

  // The person query over the same collection finds nothing, rather than
  // returning companies with empty fields.
  const asPeople = await collectionRecipients(alice.scope, id);
  expect(asPeople?.people).toEqual([]);
});

test('an id list drops rows from another workspace', async () => {
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const { idsCompanyRecipients } = await import('../src/lib/server/outreach-recipients');
  const foreign = (await saveCompany(outsider.scope, null, { name: 'Elsewhere' })).id;

  const found = await idsCompanyRecipients(alice.scope, [acmeId, foreign]);
  expect(found.members.map((m) => m.id)).toEqual([acmeId]);
});

test('resolveAudience follows the template target', async () => {
  const { createCollection, addManyToCollection } = await import('../src/lib/server/collections');
  const { resolveAudience } = await import('../src/lib/server/outreach-recipients');
  const { id } = await createCollection(alice.scope, { name: 'Mixed' });
  await addManyToCollection(alice.scope, id, 'company', [acmeId]);

  const asCompany = await resolveAudience(alice.scope, 'company', { collectionId: id });
  expect(asCompany?.members).toHaveLength(1);

  const asPerson = await resolveAudience(alice.scope, 'person', { collectionId: id });
  expect(asPerson?.members).toEqual([]);

  expect(await resolveAudience(alice.scope, 'company', {})).toBeNull();
});

test('the audience is capped', async () => {
  const { idsCompanyRecipients, MAX_AUDIENCE } = await import(
    '../src/lib/server/outreach-recipients'
  );
  const padded = [...Array.from({ length: MAX_AUDIENCE }, () => 'nope'), acmeId];
  // `acmeId` falls off the end of the slice, so nothing resolves.
  expect((await idsCompanyRecipients(alice.scope, padded)).members).toEqual([]);
});
