import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';

/** Who this token acts as, and what it may do. The first call any client makes. */
export const GET: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'read');
  return apiOk({
    user: { id: s.userId, email: locals.user?.email ?? null, username: locals.user?.username ?? null },
    workspace: { id: s.workspaceId, name: locals.user?.workspaceName ?? null, region: s.region },
    role: s.role,
    // Null for a cookie session: the UI is not scope-limited.
    scopes: locals.token?.scopes ?? null
  });
};
