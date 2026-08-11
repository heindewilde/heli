import sanitizeHtml from 'sanitize-html';
// The allowlist lives in a module the browser can import too, so the editor's
// paste filter and this sanitizer cannot drift. This remains the enforcing end.
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from '$lib/richText';

const options: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    // Squire's canonical output is `<b>`/`<i>` — it actively rewrites STRONG to
    // B and EM to I as part of its own cleanup, so an editor round trip would
    // otherwise lose every bold and italic to the allowlist. sanitize-html runs
    // transforms *before* the allowlist check, so the transformed name is what
    // gets tested and neither tag needs adding to ALLOWED_TAGS. Stored markup
    // stays in one vocabulary: `<strong>` in, `<b>` in the editor, `<strong>`
    // back out.
    b: 'strong',
    i: 'em',
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        rel: 'nofollow noopener noreferrer',
        target: '_blank'
      }
    })
  }
};

export function sanitize(html: string): string {
  return sanitizeHtml(html, options);
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizePlainText(value: string, max = 4000): string {
  return value.replace(CONTROL_CHARS, '').trim().slice(0, max);
}
