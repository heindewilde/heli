// Relative, not `$lib`: this module is imported directly by the mobile app,
// which has no SvelteKit alias to resolve. Every module on the shared list
// follows the same rule.
import type { InteractionType } from '../interactionTypes';

/**
 * The outreach platform vocabulary, with no dependencies.
 *
 * Split from any icon module for the same reason as `interactionTypes.ts`:
 * server code needs the list, the limits and the interaction mapping, and
 * importing the icon module server-side would pull the whole lucide package
 * into the server graph. Icons live in a sibling module.
 */

export const OUTREACH_PLATFORMS = [
  'email',
  'linkedin_dm',
  'linkedin_note',
  'linkedin_inmail',
  'x_dm',
  'whatsapp',
  'call',
  'other'
] as const;

export type OutreachPlatform = (typeof OUTREACH_PLATFORMS)[number];

/**
 * How to reach the person on this platform.
 *
 * `mailto` builds a link from their email; `profile` opens a URL already on the
 * record; `none` is for a template you read rather than send, like a call
 * script.
 */
export type DeepLink =
  | { kind: 'none' }
  | { kind: 'mailto' }
  | { kind: 'profile'; field: 'linkedinUrl' | 'xUrl' }
  | { kind: 'whatsapp' };

export type PlatformSpec = {
  label: string;
  /** Email and InMail carry a subject; nothing else does. */
  hasSubject: boolean;
  /** Character budget for the subject, when there is one. */
  subjectMax?: number;
  /** Character budget for the body, or null where the platform sets none. */
  bodyMax: number | null;
  /**
   * What a sent message of this kind is logged as. There is no `linkedin_dm`
   * interaction type and there should not be one — `INTERACTION_TYPES` is a
   * small shared vocabulary with icons, filters and a documented API surface
   * behind it. The specificity is carried by the template reference on the
   * interaction instead.
   */
  interactionType: InteractionType;
  deepLink: DeepLink;
};

export const PLATFORMS: Record<OutreachPlatform, PlatformSpec> = {
  email: {
    label: 'Email',
    hasSubject: true,
    bodyMax: null,
    interactionType: 'email',
    deepLink: { kind: 'mailto' }
  },
  linkedin_dm: {
    label: 'LinkedIn message',
    hasSubject: false,
    bodyMax: null,
    interactionType: 'dm',
    deepLink: { kind: 'profile', field: 'linkedinUrl' }
  },
  linkedin_note: {
    label: 'LinkedIn connection note',
    hasSubject: false,
    bodyMax: 300,
    interactionType: 'dm',
    deepLink: { kind: 'profile', field: 'linkedinUrl' }
  },
  linkedin_inmail: {
    label: 'LinkedIn InMail',
    hasSubject: true,
    subjectMax: 200,
    bodyMax: 1900,
    interactionType: 'dm',
    deepLink: { kind: 'profile', field: 'linkedinUrl' }
  },
  x_dm: {
    label: 'X message',
    hasSubject: false,
    bodyMax: 10000,
    interactionType: 'dm',
    deepLink: { kind: 'profile', field: 'xUrl' }
  },
  whatsapp: {
    label: 'WhatsApp',
    hasSubject: false,
    bodyMax: null,
    interactionType: 'dm',
    deepLink: { kind: 'whatsapp' }
  },
  call: {
    label: 'Call script',
    hasSubject: false,
    bodyMax: null,
    interactionType: 'call',
    deepLink: { kind: 'none' }
  },
  other: {
    label: 'Other',
    hasSubject: false,
    bodyMax: null,
    interactionType: 'other',
    deepLink: { kind: 'none' }
  }
};

export function isOutreachPlatform(v: unknown): v is OutreachPlatform {
  return typeof v === 'string' && (OUTREACH_PLATFORMS as readonly string[]).includes(v);
}

/**
 * Only email templates keep their formatting.
 *
 * LinkedIn, X and WhatsApp composers accept plain text and nothing else, so
 * authoring rich text for them would show formatting that cannot survive the
 * paste. A plain textarea is the honest control there.
 */
export function isRichPlatform(platform: OutreachPlatform): boolean {
  return platform === 'email';
}
