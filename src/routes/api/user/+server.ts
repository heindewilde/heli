import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  AuthError,
  deleteAccount,
  logoutOthers,
  updateEmail,
  updatePassword,
  updateUsername,
  verifyPassword
} from '$lib/server/auth';
import { clearSessionCookie } from '$lib/server/cookies';
import { sanitizePlainText } from '$lib/server/sanitize';

const ACTIONS = [
  'updateUsername',
  'updateEmail',
  'updatePassword',
  'signOutOtherDevices',
  'deleteAccount'
] as const;
type Action = (typeof ACTIONS)[number];

function isAction(v: unknown): v is Action {
  return typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  const sessionCookie = cookies.get('gusto_session');
  if (!sessionCookie) throw error(401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isAction(body.action)) throw error(400, 'invalid_action');

  const userId = locals.user.id;
  const region = locals.user.region;

  try {
    switch (body.action) {
      case 'updateUsername': {
        const username = sanitizePlainText(String(body.username ?? ''), 64) || null;
        await updateUsername(userId, region, username);
        return json({ ok: true, username });
      }
      case 'updateEmail': {
        const password = String(body.currentPassword ?? '');
        if (!(await verifyPassword(userId, region, password))) {
          throw error(403, 'wrong_password');
        }
        const newEmail = String(body.email ?? '');
        await updateEmail(userId, region, newEmail);
        return json({ ok: true, email: newEmail.trim().toLowerCase() });
      }
      case 'updatePassword': {
        const current = String(body.currentPassword ?? '');
        if (!(await verifyPassword(userId, region, current))) {
          throw error(403, 'wrong_password');
        }
        const next = String(body.newPassword ?? '');
        await updatePassword(userId, region, next);
        return json({ ok: true });
      }
      case 'signOutOtherDevices': {
        await logoutOthers(userId, sessionCookie, region);
        return json({ ok: true });
      }
      case 'deleteAccount': {
        const password = String(body.currentPassword ?? '');
        if (!(await verifyPassword(userId, region, password))) {
          throw error(403, 'wrong_password');
        }
        await deleteAccount(userId, region);
        clearSessionCookie(cookies);
        return json({ ok: true });
      }
    }
  } catch (err) {
    if (err instanceof AuthError) throw error(400, err.code);
    throw err;
  }

  // Should be unreachable.
  throw error(400, 'invalid_action');
};
