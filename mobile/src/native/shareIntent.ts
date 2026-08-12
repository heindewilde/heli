// `cleanUrl` is the web app's own module, imported rather than copied — the
// rules that decide whether two spellings of a LinkedIn URL are the same record
// have to be identical on both sides or a capture duplicates someone.
import { cleanUrl, UrlError } from '../../../src/lib/cleanUrl';

/**
 * What a share actually contains.
 *
 * The share sheet is not consistent about how it hands over a page. Safari
 * sends a `webUrl` when you share the page and plain text when you share a
 * selection; several apps send `"Some title https://example.com"` as one
 * string and no URL field at all; a few append tracking parameters that make
 * the same page look like a new one.
 *
 * Separated from the screen and from `expo-share-intent` so it can be tested
 * without either — the parsing is the part that can be wrong, and it is the
 * only part of the share flow that does not need a device.
 */

export type ShareInput = {
  webUrl?: string | null;
  text?: string | null;
};

export type ShareResult =
  | { kind: 'url'; url: string }
  | { kind: 'none' }
  /** Text arrived, but nothing in it was a link. */
  | { kind: 'unusable'; text: string };

/**
 * Pull a URL out of shared text.
 *
 * Stops at whitespace, and trims the trailing punctuation that comes from a URL
 * sitting at the end of a sentence — `example.com/x.` is a link followed by a
 * full stop far more often than it is a link ending in one.
 */
export function extractUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}]+$/, '');
}

/**
 * Resolve a share to a canonical URL.
 *
 * `webUrl` wins when both are present: it is the structured field, and the text
 * beside it is usually a page title. Everything goes through `cleanUrl`, so a
 * share and a browser-extension capture of the same page produce the same
 * record rather than two.
 */
export function resolveShare(input: ShareInput): ShareResult {
  const candidate = input.webUrl?.trim() || extractUrl(input.text ?? '') || '';
  if (!candidate) {
    const text = (input.text ?? '').trim();
    return text ? { kind: 'unusable', text } : { kind: 'none' };
  }

  try {
    return { kind: 'url', url: cleanUrl(candidate) };
  } catch (err) {
    if (err instanceof UrlError) {
      // Hand back what arrived rather than dropping it: the capture screen
      // shows it in an editable field, and a human can usually see what is
      // wrong with it faster than a parser can.
      return { kind: 'unusable', text: candidate };
    }
    throw err;
  }
}
