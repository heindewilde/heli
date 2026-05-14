import { redirect, error, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';

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
  return response;
};
