import type { AuthUser } from '$lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      // Single source of truth is AuthUser in src/lib/server/auth.ts. Note this
      // is handed to the client verbatim by +layout.server.ts, so `role` and
      // `workspaceName` are client-visible by design — the UI needs them to
      // render the workspace switcher and hide admin-only controls.
      user: AuthUser | null;
      // Needed by /api/workspace/switch, which rotates the session id.
      sessionId: string | null;
    }
  }
}

export {};
