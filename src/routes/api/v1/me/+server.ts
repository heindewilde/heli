import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiOk } from '$lib/server/api-v1';
import { listMemberships } from '$lib/server/workspaces';

/** Who this credential acts as, and what it may do. The first call any client makes. */
export const GET: RequestHandler = async ({ locals }) => {
  const s = requireApiScope(locals, 'read', 'me');

  // A paired device is user-scoped and switches workspace per request, so it
  // needs the full list to render its switcher. A PAT is pinned to one
  // workspace and a cookie session has the list already — but returning it
  // unconditionally keeps one response shape, and the query is a single
  // indexed read the caller was about to make anyway.
  //
  // Added rather than replacing anything: `workspace` stays the workspace this
  // request acted in, so existing clients are unaffected.
  const memberships = await listMemberships(s.region, s.userId);

  return apiOk({
    user: { id: s.userId, email: locals.user?.email ?? null, username: locals.user?.username ?? null },
    workspace: { id: s.workspaceId, name: locals.user?.workspaceName ?? null, region: s.region },
    role: s.role,
    workspaces: memberships.map((m) => ({
      id: m.workspaceId,
      name: m.workspaceName,
      role: m.role
    })),
    // Null for a cookie session: the UI is not scope-limited.
    scopes: locals.token?.scopes ?? null,
    // Which kind of credential this is, so a client can tell whether workspace
    // switching is available to it at all.
    credential: locals.token?.kind ?? 'session'
  });
};
