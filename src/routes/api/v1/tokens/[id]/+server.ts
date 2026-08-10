import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { revokeToken } from '$lib/server/tokens';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (locals.token) {
    return apiError('forbidden', 'Tokens cannot manage tokens. Sign in to the app.', 403);
  }
  const s = requireScope(locals);
  const ok = await revokeToken(s, params.id);
  if (!ok) return apiError('not_found', 'No such token.', 404);
  return apiOk({ id: params.id, revoked: true });
};
