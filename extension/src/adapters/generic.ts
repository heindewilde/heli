import { jsonLd, meta, resolve, titleTail, type Adapter } from './index';

/**
 * Anything else: Open Graph and JSON-LD, mirroring what `src/lib/server/og.ts`
 * extracts server-side. The difference is only that this runs after the page's
 * own JavaScript, so single-page sites that render their tags late still work.
 */
export const generic: Adapter = {
  id: 'generic',
  test: () => true,
  parse: (doc, url) => {
    const via: Record<string, string> = {};
    return {
      kind: 'company',
      name:
        resolve(
          doc,
          [jsonLd(['name']), meta('og:site_name'), meta('og:title'), titleTail()],
          via,
          'name'
        ) ?? url.hostname.replace(/^www\./, ''),
      description: resolve(
        doc,
        [meta('og:description'), meta('description'), jsonLd(['description'])],
        via,
        'description'
      ),
      via
    };
  }
};
