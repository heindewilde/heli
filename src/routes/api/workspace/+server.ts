import { createId } from '@paralleldrive/cuid2';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope, requireRole } from '$lib/server/scope';
import {
  MAX_OWNED_WORKSPACES,
  countOwnedWorkspaces,
  createWorkspace,
  renameWorkspace
} from '$lib/server/workspaces';
import { switchWorkspace } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';

async function readName(request: Request): Promise<string> {
  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const name = String(body.name ?? '').trim();
  if (!name) throw error(400, 'missing_name');
  return name;
}

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');
  const name = await readName(request);
  try {
    return json({ name: await renameWorkspace(s.region, s.workspaceId, name) });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};

/**
 * Create a workspace and move this session into it.
 *
 * The id is always a fresh cuid, never the user id: that slot belongs to the
 * account's first workspace, and `workspaces.id === users.id` is an artifact of
 * the backfill rather than a rule to uphold.
 */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const s = requireScope(locals);
  if (!locals.sessionId) throw error(401, 'unauthorized');
  try {
    checkRateLimit(LIMITS.workspace, s.userId);
  } catch (err) {
    if (err instanceof RateLimitError) throw error(429, 'rate_limited');
    throw err;
  }
  if ((await countOwnedWorkspaces(s.region, s.userId)) >= MAX_OWNED_WORKSPACES) {
    throw error(400, 'workspace_limit_reached');
  }
  const name = await readName(request);

  // A workspace is pinned to one region and the creator already resolves to
  // theirs, so it inherits s.region — no routing decision to make.
  const workspaceId = await createWorkspace(s.region, s.userId, name, createId());
  const rotated = await switchWorkspace(locals.sessionId, s.userId, s.region, workspaceId);
  setSessionCookie(cookies, rotated.sessionId);
  return json({ workspaceId }, { status: 201 });
};
