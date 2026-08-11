import type { Capture } from './adapters';

/**
 * The popup's form → the `POST /api/v1/capture` body.
 *
 * This lives outside `popup.ts` for one reason: it is the only part of the popup
 * a test can reach without a DOM, and it is exactly the part that was wrong.
 * The popup rendered an editable **Company** field, both the LinkedIn and GitHub
 * adapters worked to fill it, and the request never carried it — the type
 * checker cannot see a key that is simply absent from an object literal, and
 * the server received `unknown` off the wire. `tests/extension-adapters.test.ts`
 * now pins every key here against what the endpoint reads.
 */

export type Parsed = Capture & { url: string; adapter: string };

/** The raw strings the popup's inputs hold, before they become a request. */
export type FormValues = {
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  industry: string;
  description: string;
  tags: string;
  note: string;
};

export type CaptureBody = {
  url: string;
  kind: 'person' | 'company';
  name: string;
  role: string | null;
  /** An employer *name*. The server stores it as a suggestion to link. */
  company: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  /** A person's self-description; becomes their notes. */
  bio: string | null;
  industry: string | null;
  description: string | null;
  /**
   * Not editable in the popup, so not part of `FormValues`: these are read off
   * the page and a user would never retype them. A rotted selector here costs an
   * avatar, which is the whole penalty — unlike a name, where the editable field
   * is what makes degradation survivable.
   */
  avatarUrl: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  tags: string[];
  note: string | null;
};

/** Empty strings become `null`: the server treats both as "not supplied", and a
 *  blank field must never overwrite a value already on the record. */
const orNull = (v: string): string | null => v.trim() || null;

export function captureBody(parsed: Parsed, v: FormValues): CaptureBody {
  return {
    url: parsed.url,
    kind: parsed.kind,
    name: v.name.trim(),
    role: orNull(v.role),
    company: orNull(v.company),
    email: orNull(v.email),
    phone: orNull(v.phone),
    location: orNull(v.location),
    bio: orNull(v.bio),
    industry: orNull(v.industry),
    description: orNull(v.description),
    // Straight off the parse, not the form.
    avatarUrl: parsed.avatarUrl ?? null,
    linkedinUrl: parsed.linkedinUrl ?? null,
    xUrl: parsed.xUrl ?? null,
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    note: orNull(v.note)
  };
}
