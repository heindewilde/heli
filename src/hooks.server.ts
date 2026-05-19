import { redirect, error, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { setPrivate, maybeCompress } from '$lib/server/cache';

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

export const handle: Handle = async ({ event, resolve }) => {
  await ready;
  // In dev, emit a Server-Timing header so DevTools' Network panel shows the
  // total time the server spent on each request. Cheap to compute; the
  // window flips off in production so we don't leak timings to clients.
  const startedAt = dev ? performance.now() : 0;
  const cookie = event.cookies.get(SESSION_COOKIE);
  if (cookie) {
    const session = await validateSession(cookie);
    if (session) {
      event.locals.user = session.user;
    } else {
      // Stale cookie — clear it.
      event.cookies.delete(SESSION_COOKIE, { path: '/' });
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
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
  } else {
    response.headers.set(
      'Server-Timing',
      `total;dur=${(performance.now() - startedAt).toFixed(1)}`
    );
  }
  return maybeCompress(response, event.request.headers.get('accept-encoding'));
};
