/**
 * Site adapters.
 *
 * The whole reason this extension exists rather than just posting a URL to
 * `/api/save` is that it reads the **rendered, authenticated** DOM. The server
 * cannot: `og.ts` keeps an `AUTHWALL_PATTERNS` list precisely because LinkedIn
 * serves it a sign-up wall.
 *
 * Selector rot is therefore the main risk, and the design answers it directly:
 * every field resolves through an ordered list of strategies, first non-empty
 * wins, and every parsed field is editable in the popup before save. A broken
 * selector degrades to "type the name", never to "the extension is broken".
 */

export type Capture = {
  kind: 'person' | 'company';
  name: string;
  role?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  /**
   * A person's self-description. **Not** `role` — a job title and a bio are
   * different things, and the X and GitHub adapters used to resolve `role` from
   * the bio element, which stored "AI is cool i guess" as somebody's job title.
   */
  bio?: string | null;
  /** Remote profile photo. The server caches it via `cacheRemoteImage`. */
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  /** Which strategy produced each field — surfaced by the `__heli_debug` flag. */
  via?: Record<string, string>;
};

export type Adapter = {
  id: string;
  test: (url: URL) => boolean;
  parse: (doc: Document, url: URL) => Capture;
};

/* ── field strategies ────────────────────────────────────────────────────── */

export type Strategy = { name: string; get: (doc: Document) => string | null | undefined };

export function resolve(
  doc: Document,
  strategies: Strategy[],
  via: Record<string, string>,
  field: string
): string | null {
  for (const s of strategies) {
    const raw = s.get(doc);
    const value = raw?.replace(/\s+/g, ' ').trim();
    if (value) {
      via[field] = s.name;
      return value;
    }
  }
  return null;
}

export const meta = (name: string): Strategy => ({
  name: `meta:${name}`,
  // `getAttribute('content')` rather than `.content`. Identical in a real DOM,
  // and it is what lets these strategies also run against HTML parsed by
  // node-html-parser — which is how the tests exercise them against markup a
  // site actually served, instead of against a stub built to match them.
  get: (doc) =>
    doc
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute('content')
});

export const css = (selector: string): Strategy => ({
  name: `css:${selector}`,
  get: (doc) => doc.querySelector<HTMLElement>(selector)?.textContent
});

/** An attribute rather than the text — image sources, mostly. */
export const cssAttr = (selector: string, attribute: string): Strategy => ({
  name: `css:${selector}@${attribute}`,
  get: (doc) => doc.querySelector(selector)?.getAttribute(attribute)
});

/** Pull a value out of any JSON-LD block on the page. */
export const jsonLd = (path: string[]): Strategy => ({
  name: `jsonld:${path.join('.')}`,
  get: (doc) => {
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(el.textContent ?? '');
      } catch {
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        let cur: unknown = c;
        for (const key of path) {
          if (cur && typeof cur === 'object' && key in cur) cur = (cur as Record<string, unknown>)[key];
          else {
            cur = undefined;
            break;
          }
        }
        if (typeof cur === 'string' && cur.trim()) return cur;
      }
    }
    return null;
  }
});

export const titleTail = (separator = '|'): Strategy => ({
  name: 'title',
  get: (doc) => doc.title?.split(separator)[0]
});

/* ── registry ────────────────────────────────────────────────────────────── */

import { linkedin } from './linkedin';
import { github } from './github';
import { x } from './x';
import { generic } from './generic';

const ADAPTERS: Adapter[] = [linkedin, github, x];

export function pickAdapter(url: URL): Adapter {
  return ADAPTERS.find((a) => a.test(url)) ?? generic;
}
