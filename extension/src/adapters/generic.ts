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

    // On a deep path, the page title describes the *page*, not the company:
    // stripe.com/pricing gives "Tarieven en kosten", which is no kind of company
    // name. `saveCompany` handles this server-side by also fetching the site
    // root and preferring its `og:site_name` and Organization JSON-LD; a content
    // script only ever has the one document, so its equivalent is to stop at the
    // site-level signals and fall through to the hostname.
    //
    // The trade-off is a directory page — `example.com/companies/acme`, where
    // og:title really is the company — which lands as "example.com" instead. A
    // plausible hostname is a better failure than a confident wrong answer, and
    // either way the field arrives editable in the popup.
    const isDeepPath = url.pathname.split('/').filter(Boolean).length > 0;
    const nameStrategies = isDeepPath
      ? [jsonLd(['name']), meta('og:site_name')]
      : [jsonLd(['name']), meta('og:site_name'), meta('og:title'), titleTail()];

    return {
      kind: 'company',
      name: resolve(doc, nameStrategies, via, 'name') ?? url.hostname.replace(/^www\./, ''),
      description: resolve(
        doc,
        [meta('og:description'), meta('description'), jsonLd(['description'])],
        via,
        'description'
      ),
      avatarUrl: resolve(doc, [meta('og:image'), jsonLd(['logo'])], via, 'avatarUrl'),
      via
    };
  }
};
