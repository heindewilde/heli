import { parse } from 'node-html-parser';

/**
 * Just enough `Document` for the extension's field strategies, backed by real
 * HTML.
 *
 * The strategies touch exactly three things: `title`, `querySelector` and
 * `querySelectorAll`. `node-html-parser` — already an app dependency, so this
 * costs no footprint — provides the last two; only `title` needs supplying.
 *
 * This replaced a hand-written stub that matched selector *strings* the tests
 * planted. That stub could not fail when a site renamed a class, which is the
 * one failure mode these adapters have. Parsing real markup can.
 *
 * Caveat worth knowing: HTML fetched from a server is pre-hydration, while the
 * content script runs against the live DOM. A selector targeting
 * client-rendered content will look dead here and still work in the browser —
 * `extension/README.md` covers verifying those against a real page.
 */
export function docFromHtml(html: string): Document {
  const root = parse(html);
  return {
    get title() {
      return root.querySelector('title')?.textContent ?? '';
    },
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => root.querySelectorAll(selector)
  } as unknown as Document;
}

/** A minimal real document, for cases no saved page conveniently exhibits. */
export function html(parts: {
  title?: string;
  meta?: Record<string, string>;
  jsonLd?: unknown[];
  body?: string;
}): Document {
  const metas = Object.entries(parts.meta ?? {})
    .map(([k, v]) => `<meta property="${k}" content="${v.replace(/"/g, '&quot;')}">`)
    .join('\n');
  const ld = (parts.jsonLd ?? [])
    .map((v) => `<script type="application/ld+json">${JSON.stringify(v)}</script>`)
    .join('\n');
  return docFromHtml(
    `<!doctype html><html><head>${parts.title ? `<title>${parts.title}</title>` : ''}
     ${metas}${ld}</head><body>${parts.body ?? ''}</body></html>`
  );
}
