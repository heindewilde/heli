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
      // Set only when the request authenticated with a personal access token
      // on /api/v1. Null for cookie sessions, which are the trusted UI and are
      // never scope-limited.
      token: { id: string; scopes: TokenScope[] } | null;
    }
  }
}

export {};
