import { redirect, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import {
  fetchGoogleContacts,
  storePendingImport,
  CONTACTS_IMPORT_COOKIE,
  type MappedPerson
} from '$lib/server/google';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  if (!locals.user) throw redirect(303, '/auth?next=/settings');

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw error(503, 'Google OAuth is not configured');

  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const rawCookie = cookies.get('oauth_contacts_state');

  if (!code || !stateParam || !rawCookie) {
    throw redirect(303, '/settings?import_error=failed');
  }

  let storedState: string;
  try {
    const parsed = JSON.parse(rawCookie) as { state: string };
    storedState = parsed.state;
  } catch {
    throw redirect(303, '/settings?import_error=failed');
  }

  cookies.delete('oauth_contacts_state', { path: '/' });

  if (stateParam !== storedState) {
    throw redirect(303, '/settings?import_error=failed');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/auth/google/contacts/callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) throw redirect(303, '/settings?import_error=failed');
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw redirect(303, '/settings?import_error=failed');

  let contacts: MappedPerson[];
  try {
    contacts = await fetchGoogleContacts(tokens.access_token);
  } catch {
    throw redirect(303, '/settings?import_error=failed');
  }

  // Dedup by email against existing people
  const existingRows = await db(locals.user.region)
    .select({ email: people.email })
    .from(people)
    .where(eq(people.userId, locals.user.id));

  const existingEmails = new Set(
    existingRows.map((p) => p.email?.toLowerCase().trim()).filter(Boolean) as string[]
  );

  const toImport: MappedPerson[] = [];
  let duplicateCount = 0;
  for (const c of contacts) {
    if (c.email && existingEmails.has(c.email.toLowerCase())) {
      duplicateCount++;
    } else {
      toImport.push(c);
    }
  }

  const importId = storePendingImport(locals.user.id, toImport, duplicateCount);

  cookies.set(CONTACTS_IMPORT_COOKIE, importId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 900
  });

  throw redirect(303, '/settings?import=contacts');
};
