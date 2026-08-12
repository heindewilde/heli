import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiError, apiOk, denyBearer } from '$lib/server/api-v1';
import { createToken, listTokens, isTokenScope, type TokenScope } from '$lib/server/tokens';

/**
 * Token management is cookie-session only, on purpose: a bearer credential must
 * not be able to mint another one, or revoking the one you know about would not
 * be enough to lock an attacker out. `denyBearer` rejects paired devices for the
 * same reason — a stolen phone is exactly the case where you want the web to be
 * the only place that can issue a replacement.
 */

export const GET: RequestHandler = async ({ locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  return apiOk(await listTokens(s));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const scopes = (Array.isArray(body.scopes) ? body.scopes : []).filter(isTokenScope) as TokenScope[];
  if (scopes.length === 0) {
    return apiError('invalid_request', 'At least one scope is required.', 400);
  }

  const { token, secret } = await createToken(s, {
    name: String(body.name ?? ''),
    scopes,
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : null
  });

  // The only time the secret is ever returned. It is not recoverable after this.
  return apiOk({ ...token, secret }, { status: 201 });
};
