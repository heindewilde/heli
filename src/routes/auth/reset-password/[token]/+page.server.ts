import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { consumeResetToken, AuthError } from '$lib/server/auth';

export const actions: Actions = {
  default: async ({ request, params }) => {
    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    try {
      await consumeResetToken(params.token, password);
    } catch (err) {
      if (err instanceof AuthError) {
        const message =
          err.code === 'invalid_token'
            ? 'This reset link is invalid.'
            : err.code === 'expired_token'
              ? 'This reset link has expired.'
              : err.code === 'invalid_password'
                ? 'Password must be 8–72 characters.'
                : 'Could not reset password.';
        return fail(400, { error: message });
      }
      throw err;
    }
    throw redirect(303, '/auth?reset=1');
  }
};
