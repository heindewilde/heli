import type { AuthUser } from '$lib/server/auth';
import type { TokenScope } from '$lib/server/tokens';

declare global {
  namespace App {
    // `code` rides along on thrown errors so /api/v1 can name a machine-readable
    // reason. hooks.server.ts reshapes these into { error: { code, message } }.
    interface Error {
      message: string;
      code?: string;
    }

    interface Locals {
      // Single source of truth is AuthUser in src/lib/server/auth.ts. Note this
      // is handed to the client verbatim by +layout.server.ts, so `role` and
      // `workspaceName` are client-visible by design — the UI needs them to
      // render the workspace switcher and hide admin-only controls.
      user: AuthUser | null;
      // Needed by /api/workspace/switch, which rotates the session id.
      sessionId: string | null;
      // Set only when the request authenticated with a bearer credential on
      // /api/v1 — a personal access token or a paired device. Null for cookie
      // sessions, which are the trusted UI and are never scope-limited.
      //
      // `kind` matters at exactly two places: `denyTokenAuth` rejects both, so
      // neither can mint another credential; and `/api/v1/devices/self` accepts
      // only `device`, so a phone can register its push token and unpair itself
      // without being able to touch any other device.
      token: { id: string; scopes: TokenScope[]; kind: 'pat' | 'device' } | null;
    }
  }
}

export {};
