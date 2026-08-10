import { css, jsonLd, meta, resolve, titleTail, type Adapter, type Capture } from './index';

/**
 * LinkedIn — the case the server genuinely cannot do. Logged out, it serves an
 * authwall; logged in (which the user is, in their own browser) the DOM has
 * everything.
 *
 * Class names here are LinkedIn's hashed build output and *will* rot. That is
 * why they sit last in each strategy list, behind JSON-LD and OG tags, and why
 * every field lands in an editable popup field rather than being saved blind.
 */
export const linkedin: Adapter = {
  id: 'linkedin',
  test: (url) => /(^|\.)linkedin\.com$/.test(url.hostname.replace(/^www\./, '')),
  parse: (doc, url) => {
    const via: Record<string, string> = {};
    const isCompany = /^\/(company|school|showcase)\//.test(url.pathname);

    if (isCompany) {
      const c: Capture = {
        kind: 'company',
        name:
          resolve(doc, [jsonLd(['name']), meta('og:title'), css('h1'), titleTail()], via, 'name') ??
          '',
        industry: resolve(
          doc,
          [css('.org-top-card-summary-info-list__info-item'), meta('og:description')],
          via,
          'industry'
        ),
        location: resolve(doc, [css('.org-location-dropdown button'), css('.org-top-card-summary-info-list__info-item:nth-child(2)')], via, 'location'),
        description: resolve(doc, [jsonLd(['description']), meta('og:description')], via, 'description'),
        via
      };
      return c;
    }

    return {
      kind: 'person',
      name:
        resolve(
          doc,
          [jsonLd(['name']), css('h1'), meta('og:title'), titleTail('-')],
          via,
          'name'
        ) ?? '',
      role: resolve(
        doc,
        [css('.text-body-medium.break-words'), jsonLd(['jobTitle']), meta('og:description')],
        via,
        'role'
      ),
      company: resolve(
        doc,
        [
          css('button[aria-label^="Current company"] .display-flex'),
          css('.pv-text-details__right-panel-item-text'),
          jsonLd(['worksFor', 'name'])
        ],
        via,
        'company'
      ),
      location: resolve(
        doc,
        [css('.text-body-small.inline.t-black--light.break-words'), jsonLd(['address', 'addressLocality'])],
        via,
        'location'
      ),
      via
    };
  }
};
