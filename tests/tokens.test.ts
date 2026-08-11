import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, scopeFor, type Tenant } from './helpers/fixtures';

/**
 * The token path is the app's second authentication mechanism, and unlike the
 * first one it can be handed to a program. Everything here is a property that
 * would be a security bug if it flipped.
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

async function mint(t: Tenant, scopes: ('read' | 'write' | 'capture')[] = ['read']) {
  const { createToken } = await import('../src/lib/server/tokens');
  return createToken(t.scope, { name: 'test', scopes });
}

describe('minting', () => {
  test('the secret is high-entropy, region-tagged, and never stored', async () => {
    const { secret, token } = await mint(alice);
    expect(secret).toMatch(/^heli_[a-z]+_[A-Za-z0-9_-]{43}$/);
    expect(secret.split('_')[1]).toBe(alice.scope.region);

    const row = await ctx.client.execute({
      sql: `SELECT token_hash, prefix FROM api_tokens WHERE id = ?`,
      args: [token.id]
    });
    const stored = String(row.rows[0].token_hash);
    expect(stored).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(stored).not.toContain(secret);
    // The prefix is for recognising a token in a list, not reconstructing it.
    expect(secret.startsWith(String(row.rows[0].prefix))).toBe(true);
    expect(String(row.rows[0].prefix).length).toBeLessThan(secret.length - 20);
  });

  test('two tokens never collide', async () => {
    const a = await mint(alice);
    const b = await mint(alice);
    expect(a.secret).not.toBe(b.secret);
  });

  test('a token with no scopes is refused', async () => {
    const { createToken } = await import('../src/lib/server/tokens');
    await expect(createToken(alice.scope, { name: 'x', scopes: [] })).rejects.toThrow();
  });
});

describe('validation', () => {
  test('resolves to the owner, their workspace and their live role', async () => {
    const { validateToken } = await import('../src/lib/server/tokens');
    const { secret } = await mint(alice, ['read', 'write']);
    const v = await validateToken(secret);
    expect(v).toBeTruthy();
    expect(v!.user.id).toBe(alice.user.id);
    expect(v!.user.workspaceId).toBe(alice.scope.workspaceId);
    expect(v!.user.role).toBe('owner');
    expect(v!.scopes).toEqual(['read', 'write']);
  });

  test('rejects garbage, wrong prefix, and a valid-looking forgery', async () => {
    const { validateToken } = await import('../src/lib/server/tokens');
    expect(await validateToken('nonsense')).toBeNull();
    expect(await validateToken('bearer_eu_aaa')).toBeNull();
    expect(await validateToken(`heli_${alice.scope.region}_${'a'.repeat(43)}`)).toBeNull();
  });

  test('a revoked token stops working immediately, not after the cache TTL', async () => {
    const { validateToken, revokeToken } = await import('../src/lib/server/tokens');
    const { secret, token } = await mint(alice);

    expect(await validateToken(secret)).toBeTruthy(); // now cached
    expect(await revokeToken(alice.scope, token.id)).toBe(true);
    // If revoke did not evict the LRU entry, this would still authenticate for
    // up to 30 seconds — precisely when the user is watching the button.
    expect(await validateToken(secret)).toBeNull();
  });

  test('an expired token is refused', async () => {
    const { createToken, validateToken } = await import('../src/lib/server/tokens');
    const { secret } = await createToken(alice.scope, {
      name: 'expired',
      scopes: ['read'],
      expiresAt: Date.now() - 1000
    });
    expect(await validateToken(secret)).toBeNull();
  });

  test('a token dies with its owner’s membership', async () => {
    const { validateToken } = await import('../src/lib/server/tokens');
    const { db } = await import('../src/lib/server/db');
    const { workspaceMembers } = await import('../src/lib/server/schema');
    const { and, eq } = await import('drizzle-orm');

    const carol = await makeTenant('carol');
    const { secret } = await mint(carol);
    expect(await validateToken(secret)).toBeTruthy();

    await db(carol.scope.region)
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, carol.scope.workspaceId),
          eq(workspaceMembers.userId, carol.user.id)
        )
      );
    const { forgetToken } = await import('../src/lib/server/tokens');
    forgetToken(
      (await import('node:crypto')).createHash('sha256').update(secret).digest('hex')
    );
    expect(await validateToken(secret)).toBeNull();
  });
});

describe('isolation', () => {
  test('a token only ever lists and revokes its own owner’s tokens', async () => {
    const { listTokens, revokeToken } = await import('../src/lib/server/tokens');
    const mine = await mint(alice);
    const theirs = await mint(bob);

    const aliceList = await listTokens(alice.scope);
    expect(aliceList.map((t) => t.id)).toContain(mine.token.id);
    expect(aliceList.map((t) => t.id)).not.toContain(theirs.token.id);

    // Alice cannot revoke Bob's token even knowing its id.
    expect(await revokeToken(alice.scope, theirs.token.id)).toBe(false);
    const { validateToken } = await import('../src/lib/server/tokens');
    expect(await validateToken(theirs.secret)).toBeTruthy();
  });

  test('a second member of the same workspace does not see the first’s tokens', async () => {
    const { listTokens } = await import('../src/lib/server/tokens');
    const { db } = await import('../src/lib/server/db');
    const { workspaceMembers } = await import('../src/lib/server/schema');

    await db(alice.scope.region).insert(workspaceMembers).values({
      workspaceId: alice.scope.workspaceId,
      userId: bob.user.id,
      role: 'member',
      createdAt: Date.now()
    });
    const bobHere = scopeFor({
      ...bob.user,
      workspaceId: alice.scope.workspaceId,
      workspaceName: 'alice',
      role: 'member'
    });
    expect(await listTokens(bobHere)).toEqual([]);
  });

  test('api_tokens is a PERSONAL table, so reassignAuthorship deletes it', async () => {
    const { TENANT_TABLES, PERSONAL_TABLES } = await import('../src/lib/server/migrate');
    expect(TENANT_TABLES as readonly string[]).toContain('api_tokens');
    // The distinction that matters: handing a departing member's credential to
    // the workspace owner would give them something that authenticates as
    // someone else.
    expect(PERSONAL_TABLES).toContain('api_tokens');

    const { reassignAuthorship } = await import('../src/lib/server/workspaces');
    const dave = await makeTenant('dave');
    const { token } = await mint(dave);
    await reassignAuthorship(
      dave.scope.region,
      dave.scope.workspaceId,
      dave.user.id,
      alice.user.id
    );
    const rows = await ctx.client.execute({
      sql: `SELECT id FROM api_tokens WHERE id = ?`,
      args: [token.id]
    });
    expect(rows.rows).toHaveLength(0);
  });
});

describe('scopes', () => {
  test('requireApiScope narrows a token but never a session', async () => {
    const { requireApiScope } = await import('../src/lib/server/scope');
    const readOnly = { user: alice.user, sessionId: null, token: { id: 't', scopes: ['read'] } };

    expect(() => requireApiScope(readOnly as never, 'read')).not.toThrow();
    expect(() => requireApiScope(readOnly as never, 'write')).toThrow();

    // A cookie session has no token and is not scope-limited.
    const session = { user: alice.user, sessionId: 's', token: null };
    expect(() => requireApiScope(session as never, 'write')).not.toThrow();
  });

  /**
   * The extension is handed a `capture` token and immediately performs three
   * reads: `/me` to verify it, `/lookup` to ask whether the page is already
   * saved, `/tags` for suggestions. Before this matrix existed the documented
   * setup produced a token that 403'd on all three, so the extension could not
   * connect at all — and nothing failed except the user.
   */
  test('a capture token reads exactly its three surfaces and no others', async () => {
    const { requireApiScope } = await import('../src/lib/server/scope');
    const captureOnly = {
      user: alice.user,
      sessionId: null,
      token: { id: 't', scopes: ['capture'] }
    };

    expect(() => requireApiScope(captureOnly as never, 'capture')).not.toThrow();
    for (const surface of ['me', 'lookup', 'tags'] as const) {
      expect(() => requireApiScope(captureOnly as never, 'read', surface)).not.toThrow();
    }

    // No surface named means a general read — /people, /companies, /search.
    expect(() => requireApiScope(captureOnly as never, 'read')).toThrow();
    expect(() => requireApiScope(captureOnly as never, 'write')).toThrow();
  });

  test('the surface argument does not conjure a read out of nothing', async () => {
    const { requireApiScope } = await import('../src/lib/server/scope');
    // A write-only token still cannot read: only `capture` opens those three.
    const writeOnly = { user: alice.user, sessionId: null, token: { id: 't', scopes: ['write'] } };
    expect(() => requireApiScope(writeOnly as never, 'read', 'lookup')).toThrow();
    // And `write` still implies `capture`, which is the other direction.
    expect(() => requireApiScope(writeOnly as never, 'capture')).not.toThrow();
  });

  test('a scope cannot grant more than the role allows', async () => {
    const { requireApiScope, requireRole } = await import('../src/lib/server/scope');
    const { db } = await import('../src/lib/server/db');
    const { workspaceMembers } = await import('../src/lib/server/schema');
    const { and, eq } = await import('drizzle-orm');

    const erin = await makeTenant('erin');
    await db(alice.scope.region).insert(workspaceMembers).values({
      workspaceId: alice.scope.workspaceId,
      userId: erin.user.id,
      role: 'member',
      createdAt: Date.now()
    });
    const { createToken, validateToken } = await import('../src/lib/server/tokens');
    const erinHere = scopeFor({
      ...erin.user,
      workspaceId: alice.scope.workspaceId,
      workspaceName: 'alice',
      role: 'member'
    });
    const { secret } = await createToken(erinHere, { name: 'wide', scopes: ['read', 'write'] });

    const v = await validateToken(secret);
    // Role comes from the membership row at validation time, not from the token.
    expect(v!.user.role).toBe('member');
    const s = requireApiScope({ user: v!.user, sessionId: null, token: { id: v!.tokenId, scopes: v!.scopes } } as never, 'write');
    expect(() => requireRole(s, 'owner', 'admin')).toThrow();

    // ...and demoting takes effect without touching the token.
    await db(alice.scope.region)
      .update(workspaceMembers)
      .set({ role: 'admin' })
      .where(
        and(
          eq(workspaceMembers.workspaceId, alice.scope.workspaceId),
          eq(workspaceMembers.userId, erin.user.id)
        )
      );
    const { forgetToken } = await import('../src/lib/server/tokens');
    forgetToken((await import('node:crypto')).createHash('sha256').update(secret).digest('hex'));
    expect((await validateToken(secret))!.user.role).toBe('admin');
  });
});

describe('v1 search', () => {
  /**
   * `AND p.id IN (SELECT rowid FROM people_fts …)` compared a cuid2 TEXT id
   * against the FTS table's integer rowid, so it could never match and every
   * `?q=` returned an empty list. The join has to be on rowid.
   */
  test('GET /api/v1/people?q= finds a matching person', async () => {
    const { savePerson } = await import('../src/lib/server/savePerson');
    const { GET } = await import('../src/routes/api/v1/people/+server');
    await savePerson(alice.scope, null, { name: 'Zenobia Featherstone' });

    const res = await GET({
      url: new URL('http://localhost/api/v1/people?q=Featherstone'),
      locals: { user: alice.user, sessionId: 's', token: null }
    } as never);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data.map((r) => r.name)).toContain('Zenobia Featherstone');
  });

  test('GET /api/v1/companies?q= finds a matching company', async () => {
    const { saveCompany } = await import('../src/lib/server/saveCompany');
    const { GET } = await import('../src/routes/api/v1/companies/+server');
    await saveCompany(alice.scope, null, { name: 'Quibblesworth Holdings' });

    const res = await GET({
      url: new URL('http://localhost/api/v1/companies?q=Quibblesworth'),
      locals: { user: alice.user, sessionId: 's', token: null }
    } as never);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data.map((r) => r.name)).toContain('Quibblesworth Holdings');
  });
});
