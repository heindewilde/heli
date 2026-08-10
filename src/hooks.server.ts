import { redirect, error, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { validateToken } from '$lib/server/tokens';
import { apiError, preflight, withCors } from '$lib/server/api-v1';
import { setPrivate, setPrivateRevalidate, maybeCompress } from '$lib/server/cache';
import { withTiming, current as currentTiming } from '$lib/server/timing';

const ready = (async () => {
  await initDb();
  await migrate();
})();

// Page routes that require a signed-in user. A logged-out request to any of
// these is bounced to /auth?next=<full-path> so the round-trip preserves the
// original deep link (e.g. /people/abc123 from a reminder email).
//
// Excluded:
// - / and /auth/* are public.
// - /save handles its own redirect (it can be unauthenticated and shows a
//   targeted message to sign in).
// - /health is public infra.
// - /api/* returns 401 to programmatic callers; we don't redirect API calls
//   to an HTML page.
const PROTECTED_PATTERNS = [
  /^\/people(\/|$)/,
  /^\/companies(\/|$)/,
  /^\/interactions(\/|$)/,
  /^\/projects(\/|$)/,
  /^\/settings(\/|$)/
];

// CRM pages whose SSR HTML the service worker may keep for back-navigation and
// offline reads. Deliberately excludes /settings and /admin: nothing there is
// worth an offline copy, and both render account-level detail.
const NAV_CACHEABLE = /^\/(?:people|companies|projects|interactions|collections|pipelines)(?:\/|$)/;

// The whole request runs inside one AsyncLocalStorage scope, so every query the
// db client issues lands in this request's timing bucket rather than a shared
// counter that would mix concurrent requests together.
export const handle: Handle = (input) => withTiming(async () => handleRequest(input));

/** Rewrap a SvelteKit error body as `{ error: { code, message } }`. */
async function reshapeApiError(res: Response): Promise<Response> {
  if (res.status < 400) return res;
  if (!(res.headers.get('Content-Type') ?? '').includes('json')) return res;
  let body: Record<string, unknown>;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  if (body && typeof body === 'object' && 'error' in body) return res; // already shaped
  const code =
    typeof body.code === 'string'
      ? body.code
      : res.status === 401
        ? 'unauthorized'
        : res.status === 403
          ? 'forbidden'
          : res.status === 404
            ? 'not_found'
            : res.status === 429
              ? 'rate_limited'
              : res.status < 500
                ? 'invalid_request'
                : 'server_error';
  const message = typeof body.message === 'string' ? body.message : 'Request failed.';
  const out = new Response(JSON.stringify({ error: { code, message } }), {
    status: res.status,
    headers: res.headers
  });
  out.headers.set('Content-Type', 'application/json');
  out.headers.delete('Content-Length');
  return out;
}

const handleRequest: Handle = async ({ event, resolve }) => {
  await ready;
  const startedAt = performance.now();

  // Bearer tokens are honoured on /api/v1 and nowhere else. The rest of /api/*
  // is the UI's private surface — no stability promise, no scope checks — and
  // letting a token in there would quietly make every internal endpoint public.
  const isPublicApi = event.url.pathname.startsWith('/api/v1/');
  const origin = event.request.headers.get('origin');

  if (isPublicApi && event.request.method === 'OPTIONS') {
    return preflight(origin);
  }

  const auth = isPublicApi ? event.request.headers.get('authorization') : null;
  if (auth?.startsWith('Bearer heli_')) {
    const validated = await validateToken(auth.slice('Bearer '.length).trim());
    if (!validated) {
      return withCors(apiError('unauthorized', 'Invalid or expired token.', 401), origin);
    }
    // Identical AuthUser shape to a session, so requireScope and every query
    // helper below it work unchanged.
    event.locals.user = validated.user;
    event.locals.sessionId = null;
    event.locals.token = { id: validated.tokenId, scopes: validated.scopes };

    try {
      const write = event.request.method !== 'GET';
      checkRateLimit(write ? LIMITS.apiTokenWrite : LIMITS.apiToken, validated.tokenId);
    } catch (err) {
      if (err instanceof RateLimitError) {
        const res = apiError('rate_limited', 'Too many requests.', 429);
        res.headers.set('Retry-After', '60');
        return withCors(res, origin);
      }
      throw err;
    }

    const response = await resolve(event);
    setPrivate(response);
    // A thrown `error()` — from requireScope, requireRole, a 404 on an unknown
    // route — serialises as SvelteKit's own `{ message }`. Reshape it, so the
    // envelope documented in API.md is true for *every* response and not only
    // the ones a handler returns explicitly.
    const shaped = await reshapeApiError(response);
    return withCors(maybeCompress(shaped, event.request.headers.get('accept-encoding')), origin);
  }

  event.locals.token = null;
  const cookie = event.cookies.get(SESSION_COOKIE);
  if (cookie) {
    const session = await validateSession(cookie);
    if (session) {
      event.locals.user = session.user;
      event.locals.sessionId = session.sessionId;
    } else {
      // Stale cookie — clear it.
      event.cookies.delete(SESSION_COOKIE, { path: '/' });
      event.locals.user = null;
      event.locals.sessionId = null;
    }
  } else {
    event.locals.user = null;
    event.locals.sessionId = null;
  }

  if (!event.locals.user) {
    const path = event.url.pathname;
    if (PROTECTED_PATTERNS.some((p) => p.test(path))) {
      const next = path + event.url.search;
      throw redirect(303, `/auth?next=${encodeURIComponent(next)}`);
    }
  }

  // Broad per-user rate limit on authenticated API calls.
  if (event.locals.user && event.url.pathname.startsWith('/api/')) {
    try {
      checkRateLimit(LIMITS.api, event.locals.user.id);
    } catch (err) {
      if (err instanceof RateLimitError) throw error(429, 'rate_limited');
      throw err;
    }
  }

  const response = await resolve(event);

  // Default any response that hasn't set its own Cache-Control to private/
  // no-store + Vary: Cookie. Routes that opt-in to caching (landing page,
  // avatars, install page, list APIs via cache.ts helpers) already set their
  // own header and are left untouched.
  //
  // Exception: authenticated SSR HTML for the CRM routes gets
  // `private, max-age=0, must-revalidate` instead, so the service worker may
  // keep a copy for back-navigation and offline reads. That is the same trade
  // the /api list endpoints already make — the JSON they cache is the same
  // personal data — and the worker drops every copy on sign-out and on
  // workspace switch. `no-store` would have meant caching it anyway while
  // telling the browser not to, which is worse than deciding on purpose.
  if (!response.headers.has('Cache-Control')) {
    if (
      event.locals.user &&
      event.request.method === 'GET' &&
      response.status === 200 &&
      NAV_CACHEABLE.test(event.url.pathname) &&
      (response.headers.get('Content-Type') ?? '').startsWith('text/html')
    ) {
      setPrivateRevalidate(response);
    } else {
      setPrivate(response);
    }
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Tiptap (the rich-text editor) uses inline styles and blob: URLs for image
  // paste; SvelteKit hydration requires 'unsafe-inline' scripts. This policy
  // blocks framing, plugin content, and non-https external resources while
  // keeping all existing UI functionality intact.
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ')
  );
  if (!dev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Server-Timing: always in dev, and in production only for workspace owners.
  // Split into db vs the rest, because "spend the phase on fewer queries" and
  // "spend it on more caching" are different answers and the header is what
  // decides between them. Gated rather than public so request shape isn't
  // broadcast to every visitor.
  if (dev || event.locals.user?.role === 'owner') {
    const t = currentTiming();
    const total = performance.now() - startedAt;
    const dbMs = t?.db ?? 0;
    response.headers.set(
      'Server-Timing',
      [
        `db;desc="${t?.queries ?? 0} queries";dur=${dbMs.toFixed(1)}`,
        `app;dur=${Math.max(0, total - dbMs).toFixed(1)}`,
        `total;dur=${total.toFixed(1)}`
      ].join(', ')
    );
    response.headers.append('Vary', 'Cookie');
  }
  // Errors thrown on /api/v1 that did *not* arrive with a bearer token — a
  // malformed Authorization header falls through to the cookie branch above —
  // still have to match the documented envelope.
  const shaped = isPublicApi ? await reshapeApiError(response) : response;
  return maybeCompress(shaped, event.request.headers.get('accept-encoding'));
};
