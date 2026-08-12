import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, type Tenant } from './helpers/fixtures';

/**
 * The reminder push sweep.
 *
 * Two properties here would be user-visible failures if they flipped, and
 * neither is obvious from reading the code:
 *
 *   - a reminder is claimed *before* anything is sent, so a crash loses one
 *     notification rather than repeating it every minute until it succeeds;
 *   - reminders are personal, so a push reaches its owner's devices and nobody
 *     else's — a colleague being told about someone's private reminder is a
 *     leak, not a bug.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('push-alice');
  bob = await makeTenant('push-bob');
  // Bob works alongside Alice, so "same workspace" is a real condition rather
  // than two strangers who could never have collided anyway.
  await joinWorkspace(alice, bob, 'member');
}, 120_000);

afterAll(() => ctx?.cleanup());

async function pairWithPush(t: Tenant, pushToken: string) {
  const { createPairing, claimPairing, setPushToken } = await import('../src/lib/server/devices');
  const { code } = await createPairing(t.scope);
  const result = await claimPairing(code, { name: 'phone', platform: 'ios' });
  if (!result.ok) throw new Error('claim failed');
  await setPushToken(t.scope.region, result.device.id, pushToken);
  return result.device.id;
}

async function addReminder(t: Tenant, remindAt: number) {
  const { createReminder } = await import('../src/lib/server/reminders-query');
  // A reminder needs something real to point at.
  const { savePerson } = await import('../src/lib/server/savePerson');
  // `savePerson(scope, rawUrl, manual)` — null url is the manual path.
  const person = await savePerson(t.scope, null, { name: `Ref ${Math.random()}` });
  return createReminder(t.scope, { kind: 'person', refId: person.id, remindAt });
}

describe('claiming', () => {
  test('a due reminder is claimed once, and never twice', async () => {
    const { claimDueReminders } = await import('../src/lib/server/push');
    await pairWithPush(alice, 'ExponentPushToken[alice-1]');
    const reminder = await addReminder(alice, Date.now() - 1000);

    const first = await claimDueReminders(alice.scope.region, Date.now());
    expect(first.map((d) => d.reminderId)).toContain(reminder.id);

    // The second sweep — the next tick, or another process — must find nothing.
    // This is the whole delivery guarantee: at-most-once, by stamping before
    // sending.
    const second = await claimDueReminders(alice.scope.region, Date.now());
    expect(second.map((d) => d.reminderId)).not.toContain(reminder.id);
  });

  test('notified_at is stamped before anything could be sent', async () => {
    const { claimDueReminders } = await import('../src/lib/server/push');
    await pairWithPush(alice, 'ExponentPushToken[alice-2]');
    const reminder = await addReminder(alice, Date.now() - 1000);

    await claimDueReminders(alice.scope.region, Date.now());

    const row = await ctx.client.execute({
      sql: `SELECT notified_at FROM reminders WHERE id = ?`,
      args: [reminder.id]
    });
    // Reversed — send first, stamp after — a crash in between would repeat the
    // same notification on every tick. Losing one is the better failure.
    expect(row.rows[0].notified_at).not.toBeNull();
  });

  test('a reminder that is not due yet is left alone', async () => {
    const { claimDueReminders } = await import('../src/lib/server/push');
    await pairWithPush(alice, 'ExponentPushToken[alice-3]');
    const future = await addReminder(alice, Date.now() + 3_600_000);

    const due = await claimDueReminders(alice.scope.region, Date.now());
    expect(due.map((d) => d.reminderId)).not.toContain(future.id);
  });
});

describe('who gets told', () => {
  test('a push goes only to its own owner’s devices', async () => {
    const { claimDueReminders } = await import('../src/lib/server/push');
    await pairWithPush(alice, 'ExponentPushToken[alice-only]');
    await pairWithPush(bob, 'ExponentPushToken[bob-only]');

    const reminder = await addReminder(alice, Date.now() - 1000);
    const due = await claimDueReminders(alice.scope.region, Date.now());
    const mine = due.find((d) => d.reminderId === reminder.id);

    expect(mine).toBeDefined();
    // Bob is in the same workspace. Reminders are in PERSONAL_TABLES precisely
    // because they are not the workspace's to see.
    expect(mine!.pushTokens.some((t) => t.includes('bob-only'))).toBe(false);
    expect(mine!.pushTokens.some((t) => t.includes('alice-only'))).toBe(true);
  });

  test('a revoked device stops receiving immediately', async () => {
    const { claimDueReminders } = await import('../src/lib/server/push');
    const { revokeDevice } = await import('../src/lib/server/devices');

    const deviceId = await pairWithPush(alice, 'ExponentPushToken[doomed]');
    await revokeDevice(alice.scope.region, alice.user.id, deviceId);

    await addReminder(alice, Date.now() - 1000);
    const due = await claimDueReminders(alice.scope.region, Date.now());

    // Revoking clears push_token in the same write, so a lost phone stops
    // buzzing at the moment it is revoked rather than at some later sweep.
    expect(due.flatMap((d) => d.pushTokens).some((t) => t.includes('doomed'))).toBe(false);
  });
});

describe('the message', () => {
  test('carries no names — only ids the payload cannot be read without', async () => {
    const { buildMessages } = await import('../src/lib/server/push');
    const messages = buildMessages([
      {
        reminderId: 'rem_1',
        userId: 'usr_1',
        kind: 'person',
        refId: 'per_1',
        pushTokens: ['ExponentPushToken[x]']
      }
    ]);

    expect(messages).toHaveLength(1);
    const [m] = messages;
    // Expo's relay, APNs and FCM are all third parties and this is a CRM. The
    // routing ids travel; the words do not.
    expect(m.body).not.toMatch(/per_1|usr_1/);
    expect(m.body.toLowerCase()).toContain('someone you follow');
    expect(m.data).toEqual({ kind: 'person', refId: 'per_1', reminderId: 'rem_1' });
  });

  test('one message per device, so two phones both buzz', async () => {
    const { buildMessages } = await import('../src/lib/server/push');
    const messages = buildMessages([
      {
        reminderId: 'rem_2',
        userId: 'usr_1',
        kind: 'project',
        refId: 'prj_1',
        pushTokens: ['ExponentPushToken[phone]', 'ExponentPushToken[tablet]']
      }
    ]);
    expect(messages).toHaveLength(2);
  });
});

describe('the off switch', () => {
  test('PUSH_DISABLED stops the tick without stopping the scheduler', async () => {
    const { pushTick } = await import('../src/lib/server/push');
    const previous = process.env.PUSH_DISABLED;
    process.env.PUSH_DISABLED = '1';
    try {
      await pairWithPush(alice, 'ExponentPushToken[disabled]');
      const reminder = await addReminder(alice, Date.now() - 1000);

      expect(await pushTick(alice.scope.region, Date.now())).toBe(0);

      // And, importantly, the reminder is *not* claimed — so turning push back
      // on delivers it rather than having silently burned it.
      const row = await ctx.client.execute({
        sql: `SELECT notified_at FROM reminders WHERE id = ?`,
        args: [reminder.id]
      });
      expect(row.rows[0].notified_at).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.PUSH_DISABLED;
      else process.env.PUSH_DISABLED = previous;
    }
  });
});
