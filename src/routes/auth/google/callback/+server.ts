import { redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { loginOrRegisterWithGoogle, isNewGoogleUser, AuthError } from '$lib/server/auth';
import { setSessionCookie } from '$lib/server/cookies';
import { checkRateLimit, LIMITS, RateLimitError, safeClientAddress } from '$lib/server/rate-limit';
import { env } from '$env/dynamic/private';

import { GOOGLE_PENDING_COOKIE } from '$lib/server/google';

function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw error(503, 'Google OAuth is not configured');

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const rawCookie = cookies.get('oauth_state');

  if (!code || !stateParam || !rawCookie) {
    throw redirect(303, '/auth?oauth_error=google_failed');
  }

  let storedState: string;
  let next: string;
  try {
    const parsed = JSON.parse(rawCookie) as { state: string; next: string };
    storedState = parsed.state;
    next = safeNext(parsed.next ?? '/');
  } catch {
    throw redirect(303, '/auth?oauth_error=google_failed');
  }

  cookies.delete('oauth_state', { path: '/' });

  if (stateParam !== storedState) {
    throw redirect(303, '/auth?oauth_error=google_failed');
  }

  // Exchange code for tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/auth/google/callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) throw redirect(303, '/auth?oauth_error=google_failed');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw redirect(303, '/auth?oauth_error=google_failed');

  // Fetch Google user info.
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  if (!userRes.ok) throw redirect(303, '/auth?oauth_error=google_failed');
  const googleUser = (await userRes.json()) as {
    id?: string;
    email?: string;
    name?: string;
    verified_email?: boolean;
  };

  if (!googleUser.id || !googleUser.email || !googleUser.verified_email) {
    throw redirect(303, '/auth?oauth_error=google_failed');
  }

  try {
    checkRateLimit(LIMITS.login, `google:${safeClientAddress(getClientAddress)}`);

    if (await isNewGoogleUser(googleUser.email)) {
      // New user — collect username + region before creating the account.
      cookies.set(
        GOOGLE_PENDING_COOKIE,
        JSON.stringify({ googleId: googleUser.id, email: googleUser.email, name: googleUser.name ?? '', next }),
        { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 600 }
      );
      throw redirect(303, '/auth/complete-signup');
    }

    const result = await loginOrRegisterWithGoogle({
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name ?? googleUser.email
    });
    setSessionCookie(cookies, result.sessionId);
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw redirect(303, '/auth?oauth_error=rate_limited');
    }
    if (err instanceof AuthError && err.code === 'registration_disabled') {
      throw redirect(303, '/auth?oauth_error=registration_disabled');
    }
    throw err;
  }

  throw redirect(303, next);
};
