import { css, cssAttr, meta, resolve, type Adapter, type Strategy } from './index';

/**
 * GitHub appends "Contribute to owner/repo development by creating an account
 * on GitHub." to every repository's `og:description`. Saved verbatim it is the
 * same sentence on every company record we ever capture from GitHub, so strip
 * it — and if that leaves nothing, report nothing and let the field arrive
 * empty and editable.
 */
const withoutBoilerplate = (s: Strategy): Strategy => ({
  name: s.name,
  get: (doc) =>
    s
      .get(doc)
      // `.+?` and not `[^.]+`: the repo name is in the middle of this sentence
      // and repo names contain dots ("vercel/next.js"), so a dot-excluding
      // class never matches the case this exists for.
      ?.replace(/\s*Contribute to .+? development by creating an account on GitHub\.?/i, '')
      .trim()
});

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
        // `[itemprop="name"]` without a tag or descendant, because the two DOMs
        // disagree: served HTML has `<strong itemprop=name><a>next.js</a>`, the
        // hydrated page has `<div itemprop=name>next.js</div>`. The attribute is
        // the stable part; `strong` and the child `a` are not.
        //
        // No `og:title` fallback: live it is "vercel/next.js: The React
        // Framework", which is a worse company name than the repo slug this
        // falls through to.
        name: resolve(doc, [css('[itemprop="name"]')], via, 'name') ?? segments[1],
        // `.my-3` → `.tmp-mb-3` in the current build, verified against a live
        // page; the old class matches nothing in either DOM now. Both are kept
        // because a `tmp-` prefix is not a promise of longevity, and the
        // boilerplate-stripped meta tag sits behind them either way.
        description: resolve(
          doc,
          [css('.f4.tmp-mb-3'), css('.f4.my-3'), withoutBoilerplate(meta('og:description'))],
          via,
          'description'
        ),
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
      // A GitHub profile has no job title. What it has is a bio, and that used
      // to be resolved into `role` — storing "building things on the internet"
      // as somebody's job title.
      bio: resolve(doc, [css('.user-profile-bio')], via, 'bio'),
      company: resolve(doc, [css('[itemprop="worksFor"]')], via, 'company'),
      location: resolve(doc, [css('[itemprop="homeLocation"]')], via, 'location'),
      avatarUrl: resolve(doc, [meta('og:image'), cssAttr('img.avatar-user', 'src')], via, 'avatarUrl'),
      via
    };
  }
};
