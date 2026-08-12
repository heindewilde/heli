import type { AuthUser } from '../../src/lib/server/auth';
import { requireScope, type Scope } from '../../src/lib/server/scope';

/**
 * A Scope is branded, so it cannot be hand-rolled from an object literal — the
 * only way to get one is `requireScope`. That is deliberate (see scope.ts), and
 * it means test fixtures have to build a real `App.Locals` and go through the
 * same door production code does.
 */
export function scopeFor(user: AuthUser): Scope {
  return requireScope({ user, sessionId: null } as unknown as App.Locals);
}

export type Tenant = { user: AuthUser; scope: Scope };

/**
 * Register a real user through the real auth path, so the workspace, the
 * membership row and the email_routing entry all exist exactly as they would
 * in production. Two of these give you a genuine cross-tenant pair.
 */
export async function makeTenant(label: string): Promise<Tenant> {
  const { register } = await import('../../src/lib/server/auth');
  const { user } = await register({
    email: `${label}@example.com`,
    password: 'correct-horse-battery',
    username: label
  });
  return { user, scope: scopeFor(user) };
}

/**
 * Put `guest` into `host`'s workspace and return the scope they would carry
 * while working in it.
 *
 * A tenant's own scope always points at their own workspace, so every test that
 * needs a *colleague* — the visibility rules on shared vs private templates,
 * role gates, authorship reassignment — had to insert the membership row and
 * re-mint the scope by hand. That block was copy-pasted into six files.
 *
 * The membership row is written directly rather than through an invite: these
 * tests are about what a member can do once they are in, and the invite flow has
 * its own coverage.
 */
export async function joinWorkspace(
  host: Tenant,
  guest: Tenant,
  role: 'member' | 'admin' = 'member'
): Promise<Scope> {
  const { db } = await import('../../src/lib/server/db');
  const { workspaceMembers } = await import('../../src/lib/server/schema');

  await db(host.scope.region).insert(workspaceMembers).values({
    workspaceId: host.scope.workspaceId,
    userId: guest.user.id,
    role,
    createdAt: Date.now()
  });

  return scopeFor({
    ...guest.user,
    workspaceId: host.scope.workspaceId,
    workspaceName: host.user.workspaceName,
    role
  });
}
