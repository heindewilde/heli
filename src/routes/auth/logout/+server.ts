import { redirect, type RequestHandler } from '@sveltejs/kit';
import { logout, SESSION_COOKIE } from '$lib/server/auth';
import { clearSessionCookie } from '$lib/server/cookies';

export const POST: RequestHandler = async ({ cookies }) => {
  const sessionId = cookies.get(SESSION_COOKIE);
  if (sessionId) {
    try {
      await logout(sessionId);
    } catch {
      // Best-effort: cookie still gets cleared.
    }
  }
  clearSessionCookie(cookies);
  throw redirect(303, '/');
};
