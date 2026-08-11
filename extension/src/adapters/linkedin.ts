import {
  css,
  cssAttr,
  jsonLd,
  meta,
  resolve,
  titleTail,
  type Adapter,
  type Capture,
  type Strategy
} from './index';

/**
 * LinkedIn — the case the server genuinely cannot do. Logged out, it serves an
 * authwall; logged in (which the user is, in their own browser) the DOM has
 * everything.
 *
 * Class names here are LinkedIn's hashed build output and *will* rot. That is
 * why they sit last in each strategy list, behind JSON-LD and OG tags, and why
 * every field lands in an editable popup field rather than being saved blind.
 *
 * **Checked against a live logged-in profile: the rot has already happened, and
 * it took the metadata with it.** The current profile page serves no `og:` tags,
 * no JSON-LD and no `<h1>` at all, and every class is an opaque hash
 * (`_20e55808 _4794dfd4 …`) that changes per build. So the whole "JSON-LD → OG →
 * CSS" ladder returns nothing here, and only two hash-free anchors remain:
 *
 * - the profile link itself — `a[href*="/in/<slug>"]`, where the slug comes from
 *   the URL we are already on — whose inner `[aria-label]` is the person's name;
 * - `document.title`, which is `"<Name> | LinkedIn"`.
 *
 * Both are used below. Role, company and location have no comparable anchor —
 * they are positional text inside the top card — so they are left to the old
 * selectors and arrive empty until someone builds a structural reader for them.
 */

/**
 * `"<Name> | LinkedIn"`, minus the unread-count prefix LinkedIn adds to the tab
 * title (`"(3) Satya Nadella | LinkedIn"`). The generic `titleTail` was pointed
 * at `-` rather than `|`, so it stripped nothing and the extension offered to
 * save a person called "Satya Nadella | LinkedIn".
 */
const linkedinTitle: Strategy = {
  name: 'title',
  get: (doc) => titleTail('|').get(doc)?.replace(/^\s*\(\d+\)\s*/, '')
};

/**
 * The top card's identity block: the element inside the profile's own link whose
 * `aria-label` is the person's name.
 *
 * This is the anchor everything on a person page hangs off. It survives because
 * LinkedIn has to keep it correct for screen readers, whereas the class names
 * beside it are regenerated every build. The `href` is built from the slug in the
 * URL we are already on, so it cannot match some other person in the feed.
 */
const profileBlock = (doc: Document, slug: string): Element | null =>
  doc.querySelector(`a[href*="/in/${slug}"] [aria-label]`);

/** The name as LinkedIn labels it for screen readers, on the card's own link. */
const nameFromProfileLink = (slug: string): Strategy => ({
  name: 'aria:profile-link',
  get: (doc) => profileBlock(doc, slug)?.getAttribute('aria-label')
});

/**
 * The headline ("Chairman and CEO at Microsoft"), found as *the other* paragraph
 * in the identity block — not as paragraph number two.
 *
 * That distinction is the difference between this and counting lines: the block
 * holds the name and the headline, the name is already known from the
 * `aria-label`, so the headline is whatever is left. Adding a badge or reordering
 * the two does not break it. The `·` guard skips the connection-degree marker
 * ("· 3rd") that sometimes renders as its own paragraph.
 */
const headlineFromProfileBlock = (slug: string): Strategy => ({
  name: 'aria:profile-block-headline',
  get: (doc) => {
    const block = profileBlock(doc, slug);
    if (!block) return null;
    const name = block.getAttribute('aria-label')?.trim();
    for (const p of block.querySelectorAll('p')) {
      const text = p.textContent?.replace(/\s+/g, ' ').trim();
      if (text && text !== name && !text.startsWith('·')) return text;
    }
    return null;
  }
});

/**
 * The employer, taken from the tail of the headline.
 *
 * A heuristic, deliberately, because the alternative is worse: the `/company/`
 * links inside the top card are not the person's employer. On a live profile
 * they resolved to BlackRock, Carhartt and Ford Motor Company — promoted content
 * rendered inside the same container. A wrong company is worse than none, and
 * "<title> at <Employer>" is close to universal on LinkedIn headlines.
 */
function companyFromHeadline(headline: string | null): string | null {
  const match = headline?.match(/\s+at\s+(.+)$/i)?.[1]?.trim();
  return match || null;
}

const ORG_INFO_ITEM = '.org-top-card-summary-info-list__info-item';

/**
 * The nth item of a company page's summary list, which runs industry, location,
 * follower count, employee count.
 *
 * By *match* order, not `:nth-child`. Those items are not a flat run of siblings,
 * so `:nth-child(2)` selected the follower count — a live Microsoft page had it
 * resolving "29M followers" as the company's location. The count fields are also
 * excluded explicitly, so a company with no location listed leaves the field
 * empty rather than shifting a number into it.
 */
const orgInfoItem = (index: number): Strategy => ({
  name: `css:${ORG_INFO_ITEM}[${index}]`,
  get: (doc) => {
    const text = doc.querySelectorAll(ORG_INFO_ITEM)[index]?.textContent?.trim();
    if (!text || /followers|employees|^\d/i.test(text)) return null;
    return text;
  }
});
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
          resolve(
            doc,
            [jsonLd(['name']), meta('og:title'), css('h1'), linkedinTitle],
            via,
            'name'
          ) ?? '',
        industry: resolve(doc, [orgInfoItem(0), meta('og:description')], via, 'industry'),
        // `.org-location-dropdown button` no longer matches on a live company
        // page; the summary list's second item does.
        location: resolve(
          doc,
          [css('.org-location-dropdown button'), orgInfoItem(1)],
          via,
          'location'
        ),
        description: resolve(doc, [jsonLd(['description']), meta('og:description')], via, 'description'),
        via
      };
      return c;
    }

    const slug = url.pathname.match(/^\/in\/([^/]+)/i)?.[1] ?? null;

    // The headline doubles as the role and, after " at ", as the employer.
    const role = resolve(
      doc,
      [
        css('.text-body-medium.break-words'),
        jsonLd(['jobTitle']),
        ...(slug ? [headlineFromProfileBlock(slug)] : [])
      ],
      via,
      'role'
    );

    return {
      kind: 'person',
      name:
        resolve(
          doc,
          [
            jsonLd(['name']),
            css('h1'),
            meta('og:title'),
            // Behind the standards, ahead of the title: on today's LinkedIn the
            // three above all return nothing, and this is the only anchor that
            // names the person rather than the tab.
            ...(slug ? [nameFromProfileLink(slug)] : []),
            linkedinTitle
          ],
          via,
          'name'
        ) ?? '',
      role,
      company:
        resolve(
          doc,
          [
            css('button[aria-label^="Current company"] .display-flex'),
            css('.pv-text-details__right-panel-item-text'),
            jsonLd(['worksFor', 'name'])
          ],
          via,
          'company'
        ) ?? headlineCompany(role, via),
      // Deliberately not attempted. The location sits in an unlabelled `<p>`
      // with no semantic anchor, and the only way to reach it is to count
      // paragraphs — which silently returns the wrong string the first time
      // LinkedIn reorders the card. An empty editable field beats a confident
      // wrong answer, and a follower count landing in `location` is exactly the
      // bug that shape of guess produced on company pages.
      location: null,
      avatarUrl: resolve(
        doc,
        [cssAttr('[aria-label="Profile photo"] img', 'src'), meta('og:image')],
        via,
        'avatarUrl'
      ),
      via
    };
  }
};

/** Records the derivation in `via` so `__heli_debug` shows where it came from. */
function headlineCompany(headline: string | null, via: Record<string, string>): string | null {
  const company = companyFromHeadline(headline);
  if (company) via.company = 'headline:at';
  return company;
}
