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
