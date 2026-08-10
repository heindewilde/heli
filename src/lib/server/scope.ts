import { error } from '@sveltejs/kit';
import type { WorkspaceRole } from './schema';
import type { TokenScope } from './tokens';

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

/**
 * Narrow a token's authority to a required scope.
 *
 * Scopes only ever *narrow*. The role on the Scope comes from the membership
 * row at validation time, exactly as it does for a session, so `requireRole`
 * still governs blast radius and a token can never outrank its owner. For a
 * cookie session `locals.token` is null and this is a plain `requireScope` —
 * the UI is trusted and is not scope-limited.
 */
export function requireApiScope(locals: App.Locals, need: TokenScope): Scope {
  const s = requireScope(locals);
  const token = locals.token;
  if (!token) return s;

  // `capture` exists so the browser extension can hold something *narrower*
  // than full write access — not so that a full-write token is mysteriously
  // unable to save a page. Implication runs one way only.
  const satisfied =
    token.scopes.includes(need) || (need === 'capture' && token.scopes.includes('write'));
  if (!satisfied) {
    throw error(403, { code: 'forbidden', message: `Token is missing the "${need}" scope.` });
  }
  return s;
}

export function isAdmin(s: Scope): boolean {
  return s.role === 'owner' || s.role === 'admin';
}
