import { css, meta, resolve, type Adapter } from './index';

export const x: Adapter = {
  id: 'x',
  test: (url) => ['x.com', 'twitter.com'].includes(url.hostname.replace(/^www\./, '')),
  parse: (doc, url) => {
    const via: Record<string, string> = {};
    const handle = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return {
      kind: 'person',
      name:
        resolve(
          doc,
          [css('[data-testid="UserName"] span'), meta('og:title')],
          via,
          'name'
        ) ?? handle,
      role: resolve(doc, [css('[data-testid="UserDescription"]'), meta('og:description')], via, 'role'),
      location: resolve(doc, [css('[data-testid="UserLocation"]')], via, 'location'),
      via
    };
  }
};
