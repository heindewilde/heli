import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { joinWorkspace, makeTenant, type Tenant } from './helpers/fixtures';

/**
 * Paired devices are the app's third authentication mechanism, and the first one
 * that is *user*-scoped rather than workspace-scoped. Everything here is a
 * property that would be a security bug if it flipped.
 *
 * The one that deserves the most attention is workspace resolution: a device
 * names its workspace on every request, so the checks that used to happen once
 * at mint time now have to hold on each call.
 */

let ctx: TestDb;
let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  bob = await makeTenant('bob');
}, 120_000);

afterAll(() => ctx?.cleanup());

async function pairFor(t: Tenant, name = 'iPhone') {
  const { createPairing, claimPairing } = await import('../src/lib/server/devices');
  const { code } = await createPairing(t.scope);
  const result = await claimPairing(code, { name, platform: 'ios' });
  if (!result.ok) throw new Error('claim failed');
  return result;
}

describe('the secret', () => {
  test('is region-tagged, marked, high-entropy, and never stored', async () => {
    const { secret, device } = await pairFor(alice);
    expect(secret).toMatch(/^heli_[a-z]+_dev_[A-Za-z0-9_-]{43}$/);
    expect(secret.split('_')[1]).toBe(alice.scope.region);

    const row = await ctx.client.execute({
      sql: `SELECT token_hash, prefix FROM devices WHERE id = ?`,
      args: [device.id]
    });
    const stored = String(row.rows[0].token_hash);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(secret);
    // The prefix is for recognising a device in a list, not reconstructing it.
    expect(secret.startsWith(String(row.rows[0].prefix))).toBe(true);
    expect(String(row.rows[0].prefix).length).toBeLessThan(secret.length - 20);
  });

  test('is distinguishable from a personal access token', async () => {
    const { isDeviceSecret } = await import('../src/lib/server/devices');
    const { createToken } = await import('../src/lib/server/tokens');

    const { secret: deviceSecret } = await pairFor(alice);
    const { secret: patSecret } = await createToken(alice.scope, {
      name: 'pat',
      scopes: ['read']
    });

    expect(isDeviceSecret(deviceSecret)).toBe(true);
    expect(isDeviceSecret(patSecret)).toBe(false);
  });

  test('a PAT whose body happens to begin "dev_" is still a PAT', async () => {
    const { isDeviceSecret } = await import('../src/lib/server/devices');
    // This is the whole reason the tail length is pinned at 43. base64url
    // contains both `d` and `_`, so this string is a structurally valid PAT —
    // and if `dev_` were matched with `+` instead, it would be misrouted to the
    // devices table and rejected as an invalid credential.
    const body = `dev_${'a'.repeat(39)}`;
    expect(body).toHaveLength(43);
    expect(isDeviceSecret(`heli_eu_${body}`)).toBe(false);
  });

  test('a device token is rejected by the PAT validator and vice versa', async () => {
    const { validateToken, createToken } = await import('../src/lib/server/tokens');
    const { validateDevice } = await import('../src/lib/server/devices');

    const { secret: deviceSecret } = await pairFor(alice);
    const { secret: patSecret } = await createToken(alice.scope, { name: 'p', scopes: ['read'] });

    expect(await validateToken(deviceSecret)).toBeNull();
    const asDevice = await validateDevice(patSecret, null);
    expect(asDevice).toHaveProperty('error', 'unauthorized');
  });
});

describe('workspace resolution', () => {
  test('with no header, falls back to the workspace it was paired from', async () => {
    const { validateDevice } = await import('../src/lib/server/devices');
    const { secret } = await pairFor(alice);

    const result = await validateDevice(secret, null);
    expect(result).not.toHaveProperty('error');
    if ('error' in result) throw new Error('unreachable');
    expect(result.user.workspaceId).toBe(alice.scope.workspaceId);
    expect(result.user.id).toBe(alice.user.id);
  });

  test('a named workspace the user belongs to is honoured', async () => {
    const { validateDevice } = await import('../src/lib/server/devices');
    // Alice joins Bob's workspace, so her phone can act in either.
    const inBobs = await joinWorkspace(bob, alice, 'member');
    const { secret } = await pairFor(alice);

    const result = await validateDevice(secret, inBobs.workspaceId);
    if ('error' in result) throw new Error('expected success');
    expect(result.user.workspaceId).toBe(bob.scope.workspaceId);
    // The role comes from the membership row, not from the credential.
    expect(result.user.role).toBe('member');
  });

  test('a workspace the user does not belong to is forbidden, not not-found', async () => {
    const { validateDevice } = await import('../src/lib/server/devices');
    const carol = await makeTenant('carol-outsider');
    const { secret } = await pairFor(alice);

    const result = await validateDevice(secret, carol.scope.workspaceId);
    expect(result).toHaveProperty('error', 'forbidden');
    // 403 rather than 404 on purpose: a 404 would confirm which workspace ids
    // do not exist, which is an enumeration oracle.
  });

  test('the role is re-read per request, so a demotion takes effect immediately', async () => {
    const { validateDevice, forgetDevice } = await import('../src/lib/server/devices');
    const { db } = await import('../src/lib/server/db');
    const { workspaceMembers } = await import('../src/lib/server/schema');
    const { and, eq } = await import('drizzle-orm');
    const { createHash } = await import('node:crypto');

    const dave = await makeTenant('dave');
    const inAlices = await joinWorkspace(alice, dave, 'admin');
    const { secret } = await pairFor(dave);

    const before = await validateDevice(secret, inAlices.workspaceId);
    if ('error' in before) throw new Error('expected success');
    expect(before.user.role).toBe('admin');

    await db(alice.scope.region)
      .update(workspaceMembers)
      .set({ role: 'member' })
      .where(
        and(
          eq(workspaceMembers.workspaceId, alice.scope.workspaceId),
          eq(workspaceMembers.userId, dave.user.id)
        )
      );
    // The 30s LRU would otherwise answer with the stale role; production evicts
    // on revoke, and a demotion is visible within the TTL.
    forgetDevice(createHash('sha256').update(secret).digest('hex'));

    const after = await validateDevice(secret, inAlices.workspaceId);
    if ('error' in after) throw new Error('expected success');
    expect(after.user.role).toBe('member');
  });
});

describe('lifecycle', () => {
  test('losing a membership does not unpair the device', async () => {
    const { validateDevice, listDevices, forgetDevice } = await import('../src/lib/server/devices');
    const { db } = await import('../src/lib/server/db');
    const { workspaceMembers } = await import('../src/lib/server/schema');
    const { and, eq } = await import('drizzle-orm');
    const { createHash } = await import('node:crypto');

    const erin = await makeTenant('erin');
    const inAlices = await joinWorkspace(alice, erin, 'member');
    const { secret, device } = await pairFor(erin, "Erin's phone");

    // Remove her from Alice's workspace. Her own workspace is untouched.
    await db(alice.scope.region)
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, inAlices.workspaceId),
          eq(workspaceMembers.userId, erin.user.id)
        )
      );
    forgetDevice(createHash('sha256').update(secret).digest('hex'));

    // That workspace is now closed to her...
    const denied = await validateDevice(secret, inAlices.workspaceId);
    expect(denied).toHaveProperty('error', 'forbidden');

    // ...but the device is still hers and still works in her own workspace.
    // This is the entire reason devices are not in PERSONAL_TABLES: reassigning
    // or deleting on member removal would unpair a phone she still uses.
    const still = await validateDevice(secret, erin.scope.workspaceId);
    if ('error' in still) throw new Error('expected the device to survive');
    expect(still.user.workspaceId).toBe(erin.scope.workspaceId);

    const list = await listDevices(erin.scope.region, erin.user.id);
    expect(list.map((d) => d.id)).toContain(device.id);
  });

  test('revoking works immediately, not after the cache TTL', async () => {
    const { validateDevice, revokeDevice } = await import('../src/lib/server/devices');
    const { secret, device } = await pairFor(alice, 'doomed');

    const ok = await validateDevice(secret, null);
    expect(ok).not.toHaveProperty('error');

    await revokeDevice(alice.scope.region, alice.user.id, device.id);

    // Without the prefix sweep in forgetDevice this would keep authenticating
    // for up to 30 seconds — which is exactly when the user is watching.
    const after = await validateDevice(secret, null);
    expect(after).toHaveProperty('error', 'unauthorized');
  });

  test('one person cannot revoke another person’s device', async () => {
    const { revokeDevice } = await import('../src/lib/server/devices');
    const { device } = await pairFor(alice, 'alice-only');
    const ok = await revokeDevice(bob.scope.region, bob.user.id, device.id);
    expect(ok).toBe(false);
  });

  test('revoking clears the push token in the same write', async () => {
    const { revokeDevice, setPushToken } = await import('../src/lib/server/devices');
    const { secret: _s, device } = await pairFor(alice, 'pushy');
    await setPushToken(alice.scope.region, device.id, 'ExponentPushToken[abc]');

    await revokeDevice(alice.scope.region, alice.user.id, device.id);
    const row = await ctx.client.execute({
      sql: `SELECT push_token FROM devices WHERE id = ?`,
      args: [device.id]
    });
    // A lost phone must stop receiving notifications at the moment it is
    // revoked, not at the next scheduler tick that happens to notice.
    expect(row.rows[0].push_token).toBeNull();
  });

  test('deleting the account removes its devices', async () => {
    const { deleteAccount } = await import('../src/lib/server/auth');
    const frank = await makeTenant('frank');
    const { device } = await pairFor(frank, "Frank's phone");

    await deleteAccount(frank.user.id, frank.scope.region);

    const row = await ctx.client.execute({
      sql: `SELECT COUNT(*) AS n FROM devices WHERE id = ?`,
      args: [device.id]
    });
    expect(Number(row.rows[0].n)).toBe(0);
  });
});

describe('pairing', () => {
  test('a code is single-use, even under a race', async () => {
    const { createPairing, claimPairing } = await import('../src/lib/server/devices');
    const { code } = await createPairing(alice.scope);

    const [first, second] = await Promise.all([
      claimPairing(code, { name: 'phone-a', platform: 'ios' }),
      claimPairing(code, { name: 'phone-b', platform: 'android' })
    ]);

    // Exactly one wins. The loser's device row is rolled back, so a spent code
    // can never leave two live credentials behind.
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);

    const live = await ctx.client.execute({
      sql: `SELECT COUNT(*) AS n FROM devices WHERE name IN ('phone-a','phone-b') AND revoked_at IS NULL`,
      args: []
    });
    expect(Number(live.rows[0].n)).toBe(1);
  });

  test('an expired code is refused', async () => {
    const { claimPairing, PAIRING_TTL_MS } = await import('../src/lib/server/devices');
    const { createPairing } = await import('../src/lib/server/devices');
    const { code } = await createPairing(alice.scope);

    // Age it past the TTL rather than waiting two minutes.
    await ctx.client.execute({
      sql: `UPDATE device_pairings SET expires_at = ? WHERE expires_at > ?`,
      args: [Date.now() - 1, Date.now()]
    });
    expect(PAIRING_TTL_MS).toBe(120_000);

    const result = await claimPairing(code, { name: 'late', platform: 'ios' });
    expect(result.ok).toBe(false);
  });

  test('an unknown code is refused and leaves nothing behind', async () => {
    const { claimPairing } = await import('../src/lib/server/devices');
    const before = await ctx.client.execute({ sql: `SELECT COUNT(*) AS n FROM devices`, args: [] });
    const result = await claimPairing(`${alice.scope.region}-ABCDEFGHJK`, {
      name: 'nope',
      platform: 'ios'
    });
    expect(result.ok).toBe(false);
    const after = await ctx.client.execute({ sql: `SELECT COUNT(*) AS n FROM devices`, args: [] });
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
  });

  test('the code is stored hashed, never in plaintext', async () => {
    const { createPairing } = await import('../src/lib/server/devices');
    const { code } = await createPairing(alice.scope);
    const rows = await ctx.client.execute({
      sql: `SELECT code_hash FROM device_pairings`,
      args: []
    });
    for (const r of rows.rows) {
      expect(String(r.code_hash)).toMatch(/^[0-9a-f]{64}$/);
      expect(String(r.code_hash)).not.toContain(code.split('-')[1]);
    }
  });

  test('normalizeCode forgives how people actually type', async () => {
    const { normalizeCode } = await import('../src/lib/server/devices');
    const canonical = 'eu-ABCDEFGHJK';
    expect(normalizeCode('eu-abcdefghjk')).toBe(canonical);
    expect(normalizeCode('  EU-ABCD EFGH JK ')).toBe(canonical);
    expect(normalizeCode('eu-ABCD-EFGH-JK')).toBe(canonical);
    // Crockford's confusions: I and L read as 1, O reads as 0.
    expect(normalizeCode('eu-O123456789')).toBe('eu-0123456789');
    expect(normalizeCode('eu-I123456789')).toBe('eu-1123456789');
    // Wrong length is not silently padded or truncated.
    expect(normalizeCode('eu-ABC')).toBeNull();
    expect(normalizeCode('nohyphen')).toBeNull();
  });
});

describe('tenancy classification', () => {
  test('devices and pairings are in neither table list', async () => {
    const { TENANT_TABLES, PERSONAL_TABLES } = await import('../src/lib/server/migrate');
    for (const t of ['devices', 'device_pairings']) {
      // They carry no workspace_id at all, so there is nothing for the backfill
      // to fill and nothing for reassignAuthorship to hand over. Adding either
      // to these lists would make the workspace backfill fail on a missing
      // column — and, worse, would unpair a phone on member removal.
      expect(TENANT_TABLES as readonly string[]).not.toContain(t);
      expect(PERSONAL_TABLES).not.toContain(t);
    }
  });

  test('the device itself carries no workspace', async () => {
    const info = await ctx.client.execute({ sql: `PRAGMA table_info(devices)`, args: [] });
    const cols = info.rows.map((r) => String(r.name));
    // Nothing to filter on, which is the design: the acting workspace arrives
    // per request in the header and is checked against the membership row.
    expect(cols).not.toContain('workspace_id');
    expect(cols).toContain('last_workspace_id');
  });

  test('no workspace column on either table is a foreign key', async () => {
    // `devices.last_workspace_id` and `device_pairings.workspace_id` both name a
    // workspace, and neither references one. That is deliberate and load-bearing
    // in two directions: a device outlives the workspaces it visits, and an FK
    // would make deleteAccount's purge of a sole-owner workspace fail with a
    // constraint error on a row that is only a UI hint.
    for (const t of ['devices', 'device_pairings']) {
      const fks = await ctx.client.execute({
        sql: `PRAGMA foreign_key_list(${t})`,
        args: []
      });
      expect(fks.rows.map((r) => String(r.from))).toEqual(['user_id']);
    }
  });
});
