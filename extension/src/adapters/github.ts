import { css, meta, resolve, type Adapter } from './index';

/**
 * GitHub. A `/{org}/{repo}` path is a company, matching the server's
 * `classify()` override — the two must agree, or the extension would offer to
 * create a person that `/api/save` would have stored as a company.
 */
export const github: Adapter = {
  id: 'github',
  test: (url) => url.hostname.replace(/^www\./, '') === 'github.com',
  parse: (doc, url) => {
    const via: Record<string, string> = {};
    const segments = url.pathname.split('/').filter(Boolean);
    const isRepo = segments.length >= 2;

    if (isRepo) {
      return {
        kind: 'company',
        name: resolve(doc, [css('strong[itemprop="name"] a'), meta('og:title')], via, 'name') ?? segments[1],
        description: resolve(doc, [css('.f4.my-3'), meta('og:description')], via, 'description'),
        via
      };
    }

    return {
      kind: 'person',
      name:
        resolve(
          doc,
          [css('.vcard-fullname'), css('[itemprop="name"]'), meta('og:title')],
          via,
          'name'
        ) ?? segments[0] ?? '',
      role: resolve(doc, [css('.user-profile-bio')], via, 'role'),
      company: resolve(doc, [css('[itemprop="worksFor"]')], via, 'company'),
      location: resolve(doc, [css('[itemprop="homeLocation"]')], via, 'location'),
      via
    };
  }
};
