import { redirect, error, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { setPrivate, maybeCompress } from '$lib/server/cache';
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

// The whole request runs inside one AsyncLocalStorage scope, so every query the
// db client issues lands in this request's timing bucket rather than a shared
// counter that would mix concurrent requests together.
export const handle: Handle = (input) =>
  withTiming(async () => handleRequest(input));

const handleRequest: Handle = async ({ event, resolve }) => {
  await ready;
  const startedAt = performance.now();
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
  if (!response.headers.has('Cache-Control')) {
    setPrivate(response);
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
  return maybeCompress(response, event.request.headers.get('accept-encoding'));
};
