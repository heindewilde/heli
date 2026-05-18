import type { Actions } from './$types';
import { requestPasswordReset } from '$lib/server/auth';
import { sendEmail, isEmailConfigured } from '$lib/server/email';
import { APP_NAME } from '$lib/branding';

function logResetLink(email: string, link: string, reason: string) {
  // Self-host fallback documented in SELFHOST.md: when Resend isn't wired up
  // (or the send fails), the operator can grep this line out of container
  // logs to retrieve the user's link. Always log — even in production —
  // because losing the link silently locks the user out.
  console.log(`[heli] password reset link (${reason}) for ${email}: ${link}`);
}

export const actions: Actions = {
  default: async ({ request, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '');
    const token = await requestPasswordReset(email);
    if (token) {
      const link = `${url.origin}/auth/reset-password/${token}`;
      if (!isEmailConfigured()) {
        logResetLink(email, link, 'email not configured');
      } else {
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
          logResetLink(email, link, 'send failed');
        }
      }
    }
    return { sent: true };
  }
};
