import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { deleteAccount, userHasPassword, verifyPassword, AuthError } from '$lib/server/auth';

/**
 * Delete the signed-in account, permanently.
 *
 * This exists because **both app stores require account deletion to be
 * initiable inside the app** — a link out to a web page is not accepted. It is
 * the one destructive, account-level action a bearer credential may perform,
 * and it is guarded accordingly.
 *
 * Re-authentication is mandatory, because the threat here is a stolen unlocked
 * phone rather than a stolen token:
 *
 *   - an account with a password must supply it;
 *   - an OAuth-only account, which has no password to check, must type its own
 *     email address exactly. Not a strong secret, but it is something a thief
 *     holding the handset does not necessarily have, and it makes the action
 *     deliberate rather than a mis-tap.
 *
 * `deleteAccount` refuses while the user solely owns a workspace with other
 * members in it, and reassigns authorship elsewhere first — see
 * `PERSONAL_TABLES` and `reassignAuthorship`. Devices go with the `user_id`
 * cascade, so the credential making this call dies with the account.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (await userHasPassword(s.userId, s.region)) {
    const password = String(body.currentPassword ?? '');
    if (!password || !(await verifyPassword(s.userId, s.region, password))) {
      return apiError('forbidden', 'That password is not correct.', 403);
    }
  } else {
    const typed = String(body.confirmEmail ?? '')
      .trim()
      .toLowerCase();
    if (!typed || typed !== (locals.user?.email ?? '').toLowerCase()) {
      return apiError(
        'forbidden',
        'Confirm by entering the email address on this account.',
        403
      );
    }
  }

  try {
    await deleteAccount(s.userId, s.region);
  } catch (err) {
    if (err instanceof AuthError) {
      // `owner_must_transfer`: the account solely owns a workspace that still
      // has other members in it. Nothing has been written.
      return apiError('invalid_request', err.message, 400);
    }
    throw err;
  }

  return apiOk({ deleted: true });
};
