import { dev } from '$app/environment';
import type { Actions } from './$types';
import { requestPasswordReset } from '$lib/server/auth';

export const actions: Actions = {
  default: async ({ request, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '');
    const token = await requestPasswordReset(email);
    if (token) {
      const link = `${url.origin}/auth/reset-password/${token}`;
      // Phase 1: no SMTP yet. Surface the link in dev logs so flows are testable end-to-end.
      if (dev) {
        console.log('\n[heli] password reset link for', email, '\n  ', link, '\n');
      }
    }
    return { sent: true };
  }
};
