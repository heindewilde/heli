import { PLATFORMS, type OutreachPlatform } from './platforms';

export type LinkTarget = {
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
};

/**
 * `mailto:` has no specified length limit but every implementation has one.
 * Outlook truncates around 2,000 characters including the encoded body, and
 * encoding inflates a plain message well past its character count — so the
 * warning threshold sits well below that.
 */
export const MAILTO_SAFE_LEN = 1800;

/**
 * Where "open this" should take you, or null when there is nothing to open.
 *
 * Null is a normal outcome, not an error: a call script has no destination, and
 * a person with no LinkedIn URL on file simply cannot be opened there. The
 * caller hides the button rather than offering a dead one.
 */
export function deepLinkFor(
  platform: OutreachPlatform,
  to: LinkTarget,
  message: { subject: string; body: string }
): { href: string; label: string; truncates: boolean } | null {
  const spec = PLATFORMS[platform];

  switch (spec.deepLink.kind) {
    case 'mailto': {
      if (!to.email) return null;
      const params = new URLSearchParams();
      if (message.subject) params.set('subject', message.subject);
      // `mailto:` bodies are plain text by specification — the HTML flavour
      // lives on the clipboard path only.
      if (message.body) params.set('body', message.body);
      const href = `mailto:${encodeURIComponent(to.email)}?${params.toString()}`;
      return { href, label: 'Open in mail app', truncates: href.length > MAILTO_SAFE_LEN };
    }
    case 'profile': {
      const url = spec.deepLink.field === 'linkedinUrl' ? to.linkedinUrl : to.xUrl;
      if (!url) return null;
      return {
        href: url,
        label: spec.deepLink.field === 'linkedinUrl' ? 'Open LinkedIn' : 'Open X',
        truncates: false
      };
    }
    case 'whatsapp': {
      if (!to.phone) return null;
      // wa.me wants digits only, no punctuation and no leading +.
      const digits = to.phone.replace(/\D/g, '');
      if (!digits) return null;
      const query = message.body ? `?text=${encodeURIComponent(message.body)}` : '';
      return { href: `https://wa.me/${digits}${query}`, label: 'Open WhatsApp', truncates: false };
    }
    default:
      return null;
  }
}
