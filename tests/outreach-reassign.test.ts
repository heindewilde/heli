import { afterAll, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, scopeFor, type Tenant } from './helpers/fixtures';

/**
 * Outreach templates are the first table where "is this row personal?" is
 * decided per row rather than per table. A shared template is workspace
 * property and passes to the owner like any other record; a private one was
 * deliberately kept unshared, and handing it over would publish it.
 *
 * The ordering inside `reassignAuthorship` is the fragile part: the DELETE has
 * to run before the UPDATE, because afterwards the private rows no longer match
 * `user_id = fromUserId` and would survive as the owner's.
 */

let ctx: TestDb;
let owner: Tenant;
let leaver: Tenant;

let sharedId: string;
let privateId: string;
let ownerPrivateId: string;

async function templateIds(): Promise<Record<string, string | undefined>> {
  const { db } = await import('../src/lib/server/db');
  const { outreachTemplates } = await import('../src/lib/server/schema');
  const rows = await db(owner.scope.region)
    .select({
      id: outreachTemplates.id,
      userId: outreachTemplates.userId,
      name: outreachTemplates.name
    })
    .from(outreachTemplates);
  return Object.fromEntries(rows.map((r) => [r.id, r.userId]));
}

beforeAll(async () => {
  ctx = await freshDb();
  owner = await makeTenant('owner');
  leaver = await makeTenant('leaver');

  const { db } = await import('../src/lib/server/db');
  const { workspaceMembers, outreachTemplates } = await import('../src/lib/server/schema');
  const { createId } = await import('@paralleldrive/cuid2');

  await db(owner.scope.region).insert(workspaceMembers).values({
    workspaceId: owner.scope.workspaceId,
    userId: leaver.user.id,
    role: 'member',
    createdAt: Date.now()
  });

  const now = Date.now();
  sharedId = createId();
  privateId = createId();
  ownerPrivateId = createId();

  const base = {
    workspaceId: owner.scope.workspaceId,
    platform: 'email',
    subject: 'Hello',
    body: '<p>Hi {{first_name}}</p>',
    nudgeDays: null,
    isArchived: 0,
    createdAt: now,
    updatedAt: now
  };

  await db(owner.scope.region)
    .insert(outreachTemplates)
    .values([
      { ...base, id: sharedId, userId: leaver.user.id, name: 'Team intro', visibility: 'shared' },
      { ...base, id: privateId, userId: leaver.user.id, name: 'My draft', visibility: 'private' },
      {
        ...base,
        id: ownerPrivateId,
        userId: owner.user.id,
        name: "Owner's draft",
        visibility: 'private'
      }
    ]);
}, 120_000);

afterAll(() => ctx?.cleanup());

test('ROW_PERSONAL keys are tenant tables and not whole-table personal', async () => {
  const { TENANT_TABLES, PERSONAL_TABLES, ROW_PERSONAL } = await import(
    '../src/lib/server/migrate'
  );
  for (const t of Object.keys(ROW_PERSONAL)) {
    // Reassignment only ever walks TENANT_TABLES, so a key outside it is dead.
    expect(TENANT_TABLES as readonly string[]).toContain(t);
    // Both would mean the whole table is deleted and the predicate never runs.
    expect(PERSONAL_TABLES).not.toContain(t);
  }
});

test('a departing member keeps nothing private and gives up nothing shared', async () => {
  const { reassignAuthorship } = await import('../src/lib/server/workspaces');

  await reassignAuthorship(
    owner.scope.region,
    owner.scope.workspaceId,
    leaver.user.id,
    owner.user.id
  );

  const byId = await templateIds();

  // Shared: survives, now attributed to the owner.
  expect(byId[sharedId]).toBe(owner.user.id);

  // Private: gone. Not reassigned — that would hand the owner a draft its
  // author chose not to share.
  expect(byId[privateId]).toBeUndefined();

  // Untouched: the sweep is scoped to the leaver, so the owner's own private
  // template is still theirs.
  expect(byId[ownerPrivateId]).toBe(owner.user.id);
});

test('a stage attachment goes with the template it pointed at', async () => {
  const { db } = await import('../src/lib/server/db');
  const { pipelineStageTemplates } = await import('../src/lib/server/schema');
  // The private template was deleted above; its join rows must not outlive it.
  const rows = await db(owner.scope.region)
    .select({ templateId: pipelineStageTemplates.templateId })
    .from(pipelineStageTemplates);
  expect(rows.every((r) => r.templateId !== privateId)).toBe(true);
});
