import { redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createId } from '@paralleldrive/cuid2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw error(503, 'Google OAuth is not configured');

  const state = createId();
  const next = url.searchParams.get('next') ?? '/';

  cookies.set('oauth_state', JSON.stringify({ state, next }), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 600
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state
  });

  throw redirect(303, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
