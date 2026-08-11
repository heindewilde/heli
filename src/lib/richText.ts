/**
 * Telling legacy plain-text notes apart from real HTML.
 *
 * `notes` and the various `description` columns have always been stored as a
 * string and rendered with `{@html}`, sanitized on write — but until the rich
 * editor landed, what people actually typed was plain text, and its line
 * structure lived entirely in `\n` characters that the read view surfaced with
 * `whitespace-pre-wrap`.
 *
 * HTML collapses whitespace. So dropping one of those older values straight
 * into a rich editor would silently run every paragraph together, and rendering
 * new editor output under `whitespace-pre-wrap` doubles the gaps between
 * `<p>` tags. One test decides both: does this value already express its line
 * structure in markup?
 *
 * There is no backfill. A row normalizes the first time someone edits it.
 */

/**
 * The one allowlist.
 *
 * `sanitize.ts` enforces it on write — that is the security boundary and the
 * only one that matters. The editor mirrors it when filtering a paste, purely
 * so that what you see after pasting from Gmail is what survives a save.
 * Squire's own paste handling keeps `<table>`, `<font>` and `<span style>`,
 * all of which this list drops: without the mirror you would watch a pasted
 * table render, save, and silently lose it.
 *
 * Two lists would drift, and the drift is invisible until someone saves. Hence
 * one list, here, in a module both sides can import.
 */
export const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's',
  'code', 'pre', 'blockquote',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'hr'
];

/** Attributes kept per tag. Everything else is dropped. */
export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'rel', 'target']
};

/**
 * What the paste filter accepts — the allowlist *plus* `b` and `i`.
 *
 * The server does not drop those two, it rewrites them (`transformTags` in
 * sanitize.ts), because Squire's own canonical output uses them. A paste filter
 * built on `ALLOWED_TAGS` alone would therefore be stricter than the server and
 * throw away pasted bold that would have survived a save.
 */
export const PASTE_TAGS = [...ALLOWED_TAGS, 'b', 'i'];

/** Schemes `sanitize.ts` permits on an href. */
export const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

/**
 * Block-level tags plus `<br>` — the ones that carry line structure. Inline
 * formatting (`<strong>`, `<a>`) does not count: a note that is plain text with
 * one bold word still keeps its paragraphs in `\n`.
 */
const BLOCK_MARKUP = /<(?:p|div|br|ul|ol|li|h[1-6]|blockquote|pre|hr)\b/i;

/** True when the value's line structure is already in markup. */
export function hasBlockMarkup(value: string | null | undefined): boolean {
  return !!value && BLOCK_MARKUP.test(value);
}

/**
 * Convert legacy plain text to the paragraph markup the editor expects.
 *
 * The input is already-sanitized storage, so inline tags in it are trusted and
 * deliberately not escaped — escaping here would turn a stored `<strong>` into
 * visible angle brackets.
 */
export function plainToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Storage value → what the editor should be seeded with. */
export function toEditorHtml(value: string | null | undefined): string {
  if (!value) return '';
  return hasBlockMarkup(value) ? value : plainToHtml(value);
}

/**
 * HTML → the plain-text flavour, for the `text/plain` clipboard write and
 * `mailto:` bodies (which are plain text by spec).
 *
 * Deliberately not a parser: block boundaries become newlines, tags are
 * dropped, and the handful of entities the sanitizer can emit are decoded.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|h[1-6]|blockquote|pre)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
