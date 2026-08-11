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
 * The reads a `capture` token may perform, named one by one.
 *
 * `capture` exists so the browser extension can hold something narrower than
 * write access — but the extension does not only write. It verifies the token
 * against `/me`, asks `/lookup` whether the page is already saved, and fetches
 * `/tags` for suggestions. Without these three it could not connect at all, and
 * the scope would be narrower than its own purpose.
 *
 * This union *is* the allowlist. There is no `Set` beside it to drift out of
 * sync, and widening it to `/people` or `/search` would be a compile error at
 * the call site rather than something a reviewer has to notice.
 */
export type CaptureRead = 'me' | 'lookup' | 'tags';

/**
 * Narrow a token's authority to a required scope.
 *
 * Scopes only ever *narrow*. The role on the Scope comes from the membership
 * row at validation time, exactly as it does for a session, so `requireRole`
 * still governs blast radius and a token can never outrank its owner. For a
 * cookie session `locals.token` is null and this is a plain `requireScope` —
 * the UI is trusted and is not scope-limited.
 */
export function requireApiScope(
  locals: App.Locals,
  need: TokenScope,
  /** Pass this only on the three endpoints a `capture` token must read. */
  surface?: CaptureRead
): Scope {
  const s = requireScope(locals);
  const token = locals.token;
  if (!token) return s;

  // Implication runs one way only, and only where it is spelled out: `write`
  // covers `capture`, and `capture` covers `read` on the three surfaces above.
  // A full-write token is never mysteriously unable to save a page, and a
  // capture token never gains a read it was not granted by name.
  const satisfied =
    token.scopes.includes(need) ||
    (need === 'capture' && token.scopes.includes('write')) ||
    (need === 'read' && surface !== undefined && token.scopes.includes('capture'));
  if (!satisfied) {
    throw error(403, { code: 'forbidden', message: `Token is missing the "${need}" scope.` });
  }
  return s;
}

export function isAdmin(s: Scope): boolean {
  return s.role === 'owner' || s.role === 'admin';
}
