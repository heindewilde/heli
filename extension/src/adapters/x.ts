import { css, cssAttr, meta, resolve, type Adapter } from './index';

/**
 * X. The `data-testid` attributes are the stable part here — verified against a
 * live logged-in profile, where all three still resolve. There are no `og:` tags
 * on a rendered profile, so the CSS selectors are the primary source rather than
 * the fallback, which is the opposite of every other adapter.
 */
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
      // `UserDescription` is the bio, and it used to be resolved into `role`.
      // Nobody's job title is "AI is cool i guess".
      bio: resolve(doc, [css('[data-testid="UserDescription"]'), meta('og:description')], via, 'bio'),
      location: resolve(doc, [css('[data-testid="UserLocation"]')], via, 'location'),
      avatarUrl: resolve(
        doc,
        [cssAttr('[data-testid="UserAvatar-Container-unknown"] img', 'src'), meta('og:image')],
        via,
        'avatarUrl'
      ),
      xUrl: `https://x.com/${handle}`,
      via
    };
  }
};
