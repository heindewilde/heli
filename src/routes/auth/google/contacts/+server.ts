import { redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createId } from '@paralleldrive/cuid2';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url, locals }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');

  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw error(503, 'Google OAuth is not configured');

  const state = createId();

  cookies.set('oauth_contacts_state', JSON.stringify({ state }), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 600
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${url.origin}/auth/google/contacts/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/contacts.readonly',
    state,
    access_type: 'online'
  });

  throw redirect(303, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
