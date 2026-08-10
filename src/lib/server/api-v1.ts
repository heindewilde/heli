import { json } from '@sveltejs/kit';

/**
 * Shared shaping for the documented `/api/v1` surface.
 *
 * The rest of `/api/*` is the UI's private surface: no stability promise, no
 * scope checks, shaped by whatever the pages happen to need. Tokens are
 * honoured *only* here — letting one in anywhere else would silently make every
 * internal endpoint a public API.
 */

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'server_error';

export function apiOk<T>(data: T, init?: { status?: number; nextCursor?: string | null }): Response {
  return json(
    { data, ...(init?.nextCursor !== undefined ? { nextCursor: init.nextCursor } : {}) },
    { status: init?.status ?? 200 }
  );
}

export function apiError(code: ApiErrorCode, message: string, status: number): Response {
  return json({ error: { code, message } }, { status });
}

/**
 * Origins allowed to call /api/v1 cross-origin — in practice the browser
 * extension, which cannot use the session cookie at all (it is SameSite=Lax).
 * Comma-separated, e.g. `chrome-extension://abc…,moz-extension://…`.
 */
function allowedOrigins(): string[] {
  return (process.env.EXTENSION_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apply CORS to an /api/v1 response.
 *
 * Note what is deliberately absent: `Access-Control-Allow-Credentials`. That is
 * the load-bearing safety property here — even a mistake in the origin check
 * cannot ride the user's session cookie, because the browser will not attach it.
 * The only way in is an explicit bearer token, which the user minted on purpose.
 *
 * It is also why this is not a loosening of the bookmarklet's same-origin rule
 * (see CLAUDE.md): that path is cookie-authenticated, this one cannot be.
 */
export function withCors(res: Response, origin: string | null): Response {
  if (origin && allowedOrigins().includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.append('Vary', 'Origin');
  }
  return res;
}

export function preflight(origin: string | null): Response {
  const res = new Response(null, { status: 204 });
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
  res.headers.set('Access-Control-Max-Age', '86400');
  return withCors(res, origin);
}
