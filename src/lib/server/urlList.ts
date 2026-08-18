/**
 * Pulling URLs out of whatever somebody pasted.
 *
 * The brief was "we should be the ones recognising the URLs", so this is
 * deliberately lenient rather than a format. It runs over the raw blob and
 * finds links in free text, in a Markdown link, in a CSV cell, one per line,
 * or comma-separated — because all of those are things people actually paste,
 * and asking which one they have is a question they should not have to answer.
 *
 * Not built on `parseCsv`. Running the pattern over the whole blob extracts a
 * CSV's URL column identically, without having to guess *which* column holds
 * the URL — and the bare-host pass below covers a scheme-less column, which a
 * CSV parser would hand back as an ordinary string anyway.
 */

/**
 * The generalisation of `save/+page.server.ts`'s single-URL pattern: global,
 * and with `,` excluded so a comma-separated list or a CSV row splits rather
 * than being read as one enormous URL.
 */
const URL_RE = /https?:\/\/[^\s<>"'`,)\]]+/gi;

/**
 * A host with no scheme, occupying a whole line or CSV cell. `cleanUrl` would
 * throw `bad_scheme` on `acme.com`, and a pasted column of domains is one of
 * the two shapes this feature exists for.
 *
 * Anchored to the whole field on purpose: matching bare hosts *inside* prose
 * turns "we discussed pricing i.e. the usual" into a URL.
 */
const BARE_HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i;

/** Punctuation that ends a sentence far more often than it ends a URL. */
function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?'"”’)\]}>]+$/, '');
}

/**
 * Every URL in `text`, deduped case-insensitively, in first-appearance order.
 *
 * Returns raw strings. Normalisation is `cleanUrl`'s job and happens one layer
 * up, where a failure can be counted and reported rather than silently
 * dropping a row the user can see they pasted.
 */
export function extractUrls(text: string, cap = 5000): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const url = trimTrailing(raw.trim());
    if (!url) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url);
  };

  for (const m of text.matchAll(URL_RE)) {
    if (out.length >= cap) return out;
    push(m[0]);
  }

  // Second pass for scheme-less hosts. Split on the field separators rather
  // than only on newlines, so one CSV row yields one candidate per cell.
  for (const field of text.split(/[\n\r,;\t]+/)) {
    if (out.length >= cap) return out;
    const trimmed = field.trim().replace(/^["']|["']$/g, '');
    if (!trimmed || trimmed.includes('://')) continue;
    if (BARE_HOST_RE.test(trimmed)) push(`https://${trimmed}`);
  }

  return out;
}
