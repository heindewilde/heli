import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { registerWithGoogle, AuthError, isRegistrationDisabled } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { isMultiRegion, isValidRegion } from '$lib/server/db';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { GOOGLE_PENDING_COOKIE } from '../google/callback/+server';

type Pending = { googleId: string; email: string; name: string; next: string };

function parsePending(raw: string | undefined): Pending | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    if (!p.googleId || !p.email) return null;
    return { googleId: p.googleId, email: p.email, name: p.name ?? '', next: p.next ?? '/' };
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ cookies, locals }) => {
  if (locals.user) throw redirect(303, '/');

  const pending = parsePending(cookies.get(GOOGLE_PENDING_COOKIE));
  if (!pending) throw redirect(303, '/auth');

  return {
    email: pending.email,
    multiRegion: isMultiRegion()
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const pending = parsePending(cookies.get(GOOGLE_PENDING_COOKIE));
    if (!pending) return fail(400, { error: 'Session expired. Please sign in with Google again.' });

    if (await isRegistrationDisabled()) {
      return fail(403, { error: 'Registration is disabled on this instance.' });
    }

    const data = await request.formData();
    const username = String(data.get('username') ?? '').trim();
    const regionRaw = data.get('region');

    if (!username || username.length < 1 || username.length > 50) {
      return fail(400, { username, error: 'Username must be 1–50 characters.' });
    }

    const multiRegion = isMultiRegion();
    const region = isValidRegion(regionRaw) ? regionRaw : (multiRegion ? null : 'eu');
    if (!region) {
      return fail(400, { username, error: 'Please select a data region.' });
    }

    try {
      checkRateLimit(LIMITS.register, getClientAddress());
      const result = await registerWithGoogle({
        googleId: pending.googleId,
        email: pending.email,
        username,
        region
      });
      setSessionCookie(cookies, result.sessionId);
      cookies.delete(GOOGLE_PENDING_COOKIE, { path: '/' });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(429, { username, error: 'Too many sign-ups from this IP. Try again later.' });
      }
      if (err instanceof AuthError) {
        return fail(400, {
          username,
          error:
            err.code === 'invalid_username'
              ? 'Username must be 1–50 characters.'
              : err.code === 'email_taken'
                ? 'An account with that email already exists. Sign in instead.'
                : 'Could not create your account.'
        });
      }
      throw err;
    }

    throw redirect(303, pending.next);
  }
};
