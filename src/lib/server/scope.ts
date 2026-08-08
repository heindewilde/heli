import { error } from '@sveltejs/kit';
import type { WorkspaceRole } from './schema';

declare const scopeBrand: unique symbol;

/**
 * Who is asking, and which workspace's data they may see.
 *
 * Every server query helper takes one of these instead of the old
 * `(userId: string, region: string)` pair. That is deliberate: both of those
 * were plain strings, so a rename would have let `fn(user.id, user.region)`
 * keep compiling while silently filtering by the wrong value. Collapsing them
 * into one branded object changes the *arity* as well as the type, so every
 * un-migrated call site is a hard compile error rather than a silent
 * cross-tenant data leak.
 *
 * The brand means a Scope can only be minted by `requireScope` below — you
 * cannot hand-roll one from a plain object literal.
 */
export type Scope = {
  readonly workspaceId: string;
  /** The acting user. Written to `user_id` as created-by attribution only — never a filter. */
  readonly userId: string;
  readonly region: string;
  readonly role: WorkspaceRole;
  readonly [scopeBrand]: true;
};

/** The one sanctioned place a Scope is created. Throws 401 when signed out. */
export function requireScope(locals: App.Locals): Scope {
  const u = locals.user;
  if (!u) throw error(401, 'unauthorized');
  return {
    workspaceId: u.workspaceId,
    userId: u.id,
    region: u.region,
    role: u.role
  } as Scope;
}

/** Non-throwing variant for routes that render differently when signed out. */
export function optionalScope(locals: App.Locals): Scope | null {
  return locals.user ? requireScope(locals) : null;
}

export function requireRole(s: Scope, ...allowed: WorkspaceRole[]): void {
  if (!allowed.includes(s.role)) throw error(403, 'forbidden');
}

export function isAdmin(s: Scope): boolean {
  return s.role === 'owner' || s.role === 'admin';
}
