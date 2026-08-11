import { ALLOWED_ATTRIBUTES, ALLOWED_SCHEMES, PASTE_TAGS } from '$lib/richText';

/**
 * The editor's paste filter — a WYSIWYG guarantee, not a security control.
 *
 * Squire's default paste handling strips scripts but keeps `<table>`, `<font>`,
 * `<span style>` and `<img>`. Paste an email from Gmail and you watch a styled
 * table appear, save, and lose it — because `sanitize.ts` drops all of that on
 * write. Filtering the paste to the same set the server keeps makes what you
 * see after pasting what you get after saving.
 *
 * Security still lives entirely server-side. Nothing here is trusted: this runs
 * in the page, so it is exactly as tamperable as the paste itself.
 */
const ALLOWED = new Set(PASTE_TAGS);

/** Elements whose *content* is not text, so unwrapping would expose code. */
const DROP_WHOLE = new Set(['script', 'style', 'template', 'noscript']);

function hasSafeScheme(href: string): boolean {
  const trimmed = href.trim();
  // A relative or anchor href carries no scheme and is harmless.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return true;
  return ALLOWED_SCHEMES.some((s) => trimmed.toLowerCase().startsWith(`${s}:`));
}

function clean(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (DROP_WHOLE.has(tag)) {
        el.remove();
        continue;
      }

      clean(el);

      if (!ALLOWED.has(tag)) {
        // Unwrap rather than delete: a pasted `<div>` or `<span>` is layout
        // around text people meant to keep.
        el.replaceWith(...Array.from(el.childNodes));
        continue;
      }

      for (const attr of Array.from(el.attributes)) {
        const keep = ALLOWED_ATTRIBUTES[tag] ?? [];
        if (!keep.includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
      }
      if (tag === 'a') {
        const href = el.getAttribute('href');
        if (href && !hasSafeScheme(href)) el.removeAttribute('href');
      }
    } else if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
    }
  }
}

/**
 * Squire's `sanitizeToDOMFragment` hook. `DOMParser` does not execute scripts
 * or load resources for `text/html`, so parsing the paste is inert.
 */
export function sanitizeToDOMFragment(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  while (parsed.body.firstChild) frag.appendChild(parsed.body.firstChild);
  clean(frag);
  return frag;
}
