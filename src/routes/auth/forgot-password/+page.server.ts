import { dev } from '$app/environment';
import type { Actions } from './$types';
import { requestPasswordReset } from '$lib/server/auth';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { APP_NAME } from '$lib/branding';

export const actions: Actions = {
  default: async ({ request, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '');
    const token = await requestPasswordReset(email);
    if (token) {
      const link = `${url.origin}/auth/reset-password/${token}`;
      if (dev) {
        console.log('\n[heli] password reset link for', email, '\n  ', link, '\n');
      }
      if (isEmailConfigured()) {
        try {
          await sendEmail({
            to: email,
            subject: `Reset your ${APP_NAME} password`,
            html: `<p>Someone requested a password reset for your ${APP_NAME} account.</p>
<p><a href="${link}">Reset your password</a></p>
<p>This link expires in 24 hours. If you didn't request this, you can safely ignore it.</p>`,
            text: `Reset your ${APP_NAME} password\n\n${link}\n\nThis link expires in 24 hours. If you didn't request this, you can safely ignore it.`
          });
        } catch (err) {
          console.error('[heli] failed to send password reset email:', err);
        }
      }
    }
    return { sent: true };
  }
};
