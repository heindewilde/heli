import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession, SESSION_COOKIE } from '$lib/server/auth';

const ready = (async () => {
  await initDb();
  await migrate();
})();

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

  const response = await resolve(event);

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!dev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
};
