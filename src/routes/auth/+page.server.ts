import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { register, login, AuthError, isRegistrationDisabled } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';
import { isMultiRegion, isValidRegion } from '$lib/server/db';
import { env } from '$env/dynamic/private';

function safeNext(raw: string | null): string {
  // Only allow same-origin absolute paths so a poisoned `?next=` can't
  // redirect to an attacker-controlled URL.
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (locals.user) throw redirect(303, next);
  const oauthErrorParam = url.searchParams.get('oauth_error');
  const oauthError =
    oauthErrorParam === 'registration_disabled'
      ? 'Registration is disabled on this instance.'
      : oauthErrorParam === 'rate_limited'
        ? 'Too many attempts. Try again later.'
        : oauthErrorParam === 'google_failed'
          ? 'Google sign-in failed. Please try again.'
          : null;
  return {
    mode: url.searchParams.get('mode') === 'register' ? 'register' : 'login',
    next,
    registrationDisabled: await isRegistrationDisabled(),
    multiRegion: isMultiRegion(),
    googleAuthEnabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    oauthError
  };
};

export const actions: Actions = {
  login: async ({ request, cookies, getClientAddress, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const next = safeNext(String(data.get('next') ?? '') || url.searchParams.get('next'));
    try {
      checkRateLimit(LIMITS.login, `${getClientAddress()}:${email.toLowerCase()}`);
      const result = await login({ email, password });
      setSessionCookie(cookies, result.sessionId);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(429, { mode: 'login', email, error: 'Too many attempts. Try again later.' });
      }
      if (err instanceof AuthError) {
        return fail(400, { mode: 'login', email, error: 'Invalid email or password.' });
      }
      throw err;
    }
    throw redirect(303, next);
  },

  register: async ({ request, cookies, getClientAddress, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const username = String(data.get('username') ?? '');
    const regionRaw = data.get('region');
    const next = safeNext(String(data.get('next') ?? '') || url.searchParams.get('next'));

    if (await isRegistrationDisabled()) {
      return fail(403, { mode: 'register', email, username, error: 'Registration is disabled.' });
    }

    const multiRegion = isMultiRegion();
    const region = isValidRegion(regionRaw) ? regionRaw : (multiRegion ? null : 'eu');
    if (!region) {
      return fail(400, { mode: 'register', email, username, error: 'Please select a data region.' });
    }

    try {
      checkRateLimit(LIMITS.register, getClientAddress());
      const result = await register({ email, password, username, region });
      setSessionCookie(cookies, result.sessionId);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(429, { mode: 'register', email, username, error: 'Too many sign-ups from this IP. Try again later.' });
      }
      if (err instanceof AuthError) {
        const message =
          err.code === 'email_taken'
            ? 'An account with that email already exists.'
            : err.code === 'invalid_email'
              ? 'Please enter a valid email address.'
              : err.code === 'invalid_password'
                ? 'Password must be 8–72 characters.'
                : err.code === 'invalid_username'
                  ? 'Please choose a username.'
                  : 'Could not create your account.';
        return fail(400, { mode: 'register', email, username, error: message });
      }
      throw err;
    }
    throw redirect(303, next);
  }
};
