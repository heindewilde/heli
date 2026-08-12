import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiError, apiOk, denyBearer } from '$lib/server/api-v1';
import { revokeToken } from '$lib/server/tokens';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  const ok = await revokeToken(s, params.id);
  if (!ok) return apiError('not_found', 'No such token.', 404);
  return apiOk({ id: params.id, revoked: true });
};
