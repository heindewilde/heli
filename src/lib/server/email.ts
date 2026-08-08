import { APP_NAME, APP_DOMAIN } from '$lib/branding';
import { env } from '$env/dynamic/private';

const FROM_DEFAULT = `${APP_NAME} <noreply@${APP_DOMAIN}>`;

export function isEmailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

/**
 * Escape a value for interpolation into email HTML.
 *
 * `sanitize.ts` is the wrong tool here: it's an allowlist sanitizer for stored
 * rich-text notes, so it strips tags rather than entity-encoding them and
 * leaves bare `&` alone. Mail bodies need the opposite — every user-supplied
 * value rendered as literal text.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || FROM_DEFAULT,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
