import type { RequestHandler } from './$types';
import { requireApiScope, requireRole } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createStatus, deleteStatus, listStatuses } from '$lib/server/statuses';
import { isTagScope } from '$lib/server/tags';

/**
 * The status vocabulary for people or companies.
 *
 * `scope` here reuses `isTagScope` because the two vocabularies are the same
 * pair — `person` | `company` — and inventing a second identical guard would be
 * one more thing to keep in step.
 *
 * DELETE is `requireRole`, matching the private endpoint: removing a status
 * unsets it on every record that carried it, which is workspace-wide damage
 * rather than routine CRM work.
 */

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const scope = url.searchParams.get('scope');
  if (!isTagScope(scope)) {
    return apiError('invalid_request', '`scope` must be `person` or `company`.', 400);
  }
  return apiOk(await listStatuses(scope, s));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  if (!isTagScope(body.scope)) {
    return apiError('invalid_request', '`scope` must be `person` or `company`.', 400);
  }
  try {
    const created = await createStatus(body.scope, s, {
      name: String(body.name ?? ''),
      tone: String(body.tone ?? 'gray')
    });
    return apiOk(created, { status: 201 });
  } catch (err) {
    return apiError('invalid_request', (err as Error).message, 400);
  }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'write');
  requireRole(s, 'owner', 'admin');
  const scope = url.searchParams.get('scope');
  const id = url.searchParams.get('id');
  if (!isTagScope(scope) || !id) {
    return apiError('invalid_request', '`scope` and `id` are required.', 400);
  }
  await deleteStatus(scope, s, id);
  return apiOk({ id, deleted: true });
};
