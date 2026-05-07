import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { register, login, AuthError } from '$lib/server/auth';
import { isFirstUser } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';

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
  return {
    mode: url.searchParams.get('mode') === 'register' ? 'register' : 'login',
    next,
    registrationDisabled: process.env.DISABLE_REGISTRATION === '1' && !(await isFirstUser())
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
    const username = String(data.get('username') ?? '') || null;
    const next = safeNext(String(data.get('next') ?? '') || url.searchParams.get('next'));

    if (process.env.DISABLE_REGISTRATION === '1' && !(await isFirstUser())) {
      return fail(403, { mode: 'register', email, username, error: 'Registration is disabled.' });
    }

    try {
      checkRateLimit(LIMITS.register, getClientAddress());
      const result = await register({ email, password, username });
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
                : 'Could not create your account.';
        return fail(400, { mode: 'register', email, username, error: message });
      }
      throw err;
    }
    throw redirect(303, next);
  }
};
