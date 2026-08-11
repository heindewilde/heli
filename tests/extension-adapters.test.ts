import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { docFromHtml, html } from './helpers/dom';

/**
 * The extension's adapters, exercised against real markup.
 *
 * These run in the app's suite rather than the extension's, because the
 * extension has no test runner and this is the code most likely to rot: site
 * markup changes, and the failure mode is silent — a field arrives empty and
 * nobody notices until someone captures a blank record.
 *
 * The fixtures in `tests/fixtures/` are real pages, trimmed to the title, the
 * meta tags, any JSON-LD and the elements the adapters query. Trimmed because a
 * saved GitHub page is 200–400 KB and none of the rest is read; real because the
 * stub this replaced was built to match the selectors and so could never fail
 * when a class was renamed.
 *
 * What a fixture cannot prove: selectors against client-rendered content. A
 * fetched page is pre-hydration, and the content script runs after the page's
 * own JavaScript. Those are verified against a live page — see
 * `extension/README.md`.
 */

const { pickAdapter } = await import('../extension/src/adapters/index');

const fixture = (name: string) =>
  docFromHtml(readFileSync(`tests/fixtures/${name}.html`, 'utf8'));

describe('adapter selection', () => {
  test('routes each host to its adapter', () => {
    expect(pickAdapter(new URL('https://www.linkedin.com/in/ada')).id).toBe('linkedin');
    expect(pickAdapter(new URL('https://github.com/torvalds')).id).toBe('github');
    expect(pickAdapter(new URL('https://x.com/elonmusk')).id).toBe('x');
    expect(pickAdapter(new URL('https://twitter.com/elonmusk')).id).toBe('x');
    expect(pickAdapter(new URL('https://stripe.com/pricing')).id).toBe('generic');
  });
});

describe('GitHub, against a real profile', () => {
  const url = new URL('https://github.com/torvalds');

  test('reads the name, employer and location out of the microdata', () => {
    const c = pickAdapter(url).parse(fixture('github-user'), url);
    expect(c.kind).toBe('person');
    expect(c.name).toBe('Linus Torvalds');
    // `itemprop` attributes, which GitHub has kept stable for years — unlike the
    // utility classes elsewhere in these adapters.
    expect(c.company).toBe('Linux Foundation');
    expect(c.location).toBe('Portland, OR');
  });

  test('a bio is a bio, not a job title', () => {
    // Both this adapter and X used to resolve `role` from the bio element. A
    // GitHub profile has no job title at all; it has a bio, and that belongs in
    // the person's notes.
    const c = pickAdapter(url).parse(fixture('github-user'), url);
    expect(c.role).toBeUndefined();
    // This particular real account has an empty bio, which is the degradation
    // that matters: an empty editable field, not a throw.
    expect(c.bio).toBeNull();
  });

  test('the avatar comes off the profile', () => {
    const c = pickAdapter(url).parse(fixture('github-user'), url);
    expect(c.avatarUrl).toContain('avatars.githubusercontent.com');
  });

  test('a repo is a company, and loses GitHub’s stock sentence', () => {
    const repoUrl = new URL('https://github.com/vercel/next.js');
    const c = pickAdapter(repoUrl).parse(fixture('github-repo'), repoUrl);
    expect(c.kind).toBe('company');
    expect(c.name).toBe('next.js');
    // `.f4.my-3` is gone from the served HTML — the description is rendered
    // client-side now — so this comes from og:description, minus the
    // "Contribute to … by creating an account on GitHub." that would otherwise
    // be the same sentence on every GitHub company we ever save.
    expect(c.description).toBe('The React Framework.');
  });

  test('a repo classifies the same way server-side', async () => {
    const repoUrl = new URL('https://github.com/vercel/next.js');
    // The two must agree, or the extension offers to create a person that
    // /api/save would have stored as a company.
    const { classify } = await import('../src/lib/server/classify');
    expect(classify(repoUrl)).toBe('company');
  });

  test('falls back to the URL segment when the DOM gives nothing', () => {
    expect(pickAdapter(url).parse(html({}), url).name).toBe('torvalds');
  });
});

describe('generic, against a real page', () => {
  test('a deep page does not take its title as the company name', () => {
    // The real stripe.com/pricing has no og:site_name, FAQPage JSON-LD, and an
    // og:title of "Tarieven en kosten" — the page, not the company. That title
    // used to become the company's name.
    const url = new URL('https://stripe.com/pricing');
    const c = pickAdapter(url).parse(fixture('generic-page'), url);
    expect(c.kind).toBe('company');
    expect(c.name).toBe('stripe.com');
    expect(c.description).toBeTruthy();
  });

  test('a site-level name still wins when the page offers one', () => {
    const url = new URL('https://stripe.com/pricing');
    const c = pickAdapter(url).parse(html({ meta: { 'og:site_name': 'Stripe' } }), url);
    expect(c.name).toBe('Stripe');
  });

  test('the root page may use its title, where it usually is the company', () => {
    const url = new URL('https://stripe.com/');
    expect(pickAdapter(url).parse(html({ title: 'Stripe' }), url).name).toBe('Stripe');
  });

  test('falls back to the bare hostname', () => {
    const url = new URL('https://www.example.com/about');
    expect(pickAdapter(url).parse(html({}), url).name).toBe('example.com');
  });
});

/**
 * LinkedIn logged out is an authwall, so there is no fetchable fixture — that is
 * the reason this extension exists at all. These use minimal real documents to
 * pin the strategy *ordering*, and the live DOM is checked in a browser.
 */
describe('LinkedIn', () => {
  const url = new URL('https://www.linkedin.com/in/ada');

  test('a profile prefers JSON-LD over the DOM', () => {
    const doc = html({
      jsonLd: [{ name: 'Ada Lovelace', jobTitle: 'Engineer' }],
      body: '<h1>Ada Lovelace | LinkedIn</h1>'
    });
    const c = pickAdapter(url).parse(doc, url);
    expect(c.kind).toBe('person');
    expect(c.name).toBe('Ada Lovelace');
    expect(c.via?.name).toContain('jsonld');
  });

  test('falls back down the strategy list when JSON-LD is absent', () => {
    const doc = html({ body: '<h1>  Ada  Lovelace  </h1>' });
    const c = pickAdapter(url).parse(doc, url);
    // Also checks whitespace normalisation, which matters because scraped
    // markup is full of it.
    expect(c.name).toBe('Ada Lovelace');
    expect(c.via?.name).toContain('css');
  });

  test('the employer comes from worksFor when the DOM classes miss', () => {
    const doc = html({ jsonLd: [{ name: 'Ada', worksFor: { name: 'Analytical Engines' } }] });
    expect(pickAdapter(url).parse(doc, url).company).toBe('Analytical Engines');
  });

  /**
   * Everything below was found by running the adapter against a live logged-in
   * profile. Today's LinkedIn serves no `og:` tags, no JSON-LD and no `<h1>` on
   * a person page, and every class is a per-build hash — so the entire
   * documented ladder returns nothing and only these two anchors are left.
   */
  test('the name comes off the profile link’s aria-label', () => {
    const doc = html({
      title: 'Satya Nadella | LinkedIn',
      body: `<a href="https://www.linkedin.com/in/satyanadella/">
               <div aria-label="Satya Nadella"><p>Satya Nadella</p></div>
             </a>`
    });
    const u = new URL('https://www.linkedin.com/in/satyanadella/');
    const c = pickAdapter(u).parse(doc, u);
    expect(c.name).toBe('Satya Nadella');
    expect(c.via?.name).toBe('aria:profile-link');
  });

  /**
   * The whole person top card, from the anchors verified on two live profiles:
   * `[aria-label]` inside the profile's own link for the name, the *other*
   * paragraph in that block for the headline, ` at ` for the employer, and
   * `[aria-label="Profile photo"]` for the picture.
   */
  test('reads name, role, company and avatar off the identity block', () => {
    const doc = html({
      title: 'Satya Nadella | LinkedIn',
      body: `
        <div aria-label="Profile photo"><img src="https://media.licdn.com/dms/image/v2/x"></div>
        <a href="https://www.linkedin.com/in/satyanadella/">
          <div aria-label="Satya Nadella">
            <p>Satya Nadella</p>
            <p>· 3rd</p>
            <p>Chairman and CEO at Microsoft</p>
          </div>
        </a>`
    });
    const u = new URL('https://www.linkedin.com/in/satyanadella/');
    const c = pickAdapter(u).parse(doc, u);
    expect(c.name).toBe('Satya Nadella');
    expect(c.role).toBe('Chairman and CEO at Microsoft');
    expect(c.company).toBe('Microsoft');
    expect(c.avatarUrl).toContain('media.licdn.com');
    expect(c.via?.role).toBe('aria:profile-block-headline');
    expect(c.via?.company).toBe('headline:at');
  });

  test('the headline is "the other paragraph", not paragraph number two', () => {
    // Reordering the block, or adding a badge, must not shift the headline.
    const doc = html({
      body: `<a href="https://www.linkedin.com/in/ada/">
               <div aria-label="Ada Lovelace">
                 <p>· 1st</p>
                 <p>Ada Lovelace</p>
                 <p>Engineer at Analytical Engines</p>
               </div>
             </a>`
    });
    const u = new URL('https://www.linkedin.com/in/ada/');
    const c = pickAdapter(u).parse(doc, u);
    expect(c.role).toBe('Engineer at Analytical Engines');
    expect(c.company).toBe('Analytical Engines');
  });

  test('a headline with no " at " yields a role and no company', () => {
    const doc = html({
      body: `<a href="https://www.linkedin.com/in/ada/">
               <div aria-label="Ada Lovelace"><p>Ada Lovelace</p><p>Independent researcher</p></div>
             </a>`
    });
    const u = new URL('https://www.linkedin.com/in/ada/');
    const c = pickAdapter(u).parse(doc, u);
    expect(c.role).toBe('Independent researcher');
    expect(c.company).toBeNull();
  });

  test('location is left empty rather than guessed', () => {
    // There is no semantic anchor for it, and counting paragraphs is what put a
    // follower count into a company's location. Blank and editable is correct.
    const doc = html({
      body: `<a href="https://www.linkedin.com/in/ada/">
               <div aria-label="Ada Lovelace"><p>Ada Lovelace</p><p>Engineer at X</p></div>
             </a>
             <p>London, England, United Kingdom</p>`
    });
    const u = new URL('https://www.linkedin.com/in/ada/');
    expect(pickAdapter(u).parse(doc, u).location).toBeNull();
  });

  test('the title fallback strips the site suffix and the unread count', () => {
    // The separator was `-` while LinkedIn's title uses `|`, so nothing was
    // stripped and the extension offered to save "Satya Nadella | LinkedIn".
    const u = new URL('https://www.linkedin.com/in/satyanadella/');
    const c = pickAdapter(u).parse(html({ title: '(3) Satya Nadella | LinkedIn' }), u);
    expect(c.name).toBe('Satya Nadella');
    expect(c.via?.name).toBe('title');
  });

  test('a company page parses as a company', () => {
    const companyUrl = new URL('https://www.linkedin.com/company/stripe');
    const doc = html({ jsonLd: [{ name: 'Stripe', description: 'Payments' }] });
    const c = pickAdapter(companyUrl).parse(doc, companyUrl);
    expect(c.kind).toBe('company');
    expect(c.name).toBe('Stripe');
    expect(c.description).toBe('Payments');
  });

  test('a company’s industry and location come from the summary list, in order', () => {
    // A live Microsoft page resolved "29M followers" as the location: those
    // items are not a flat run of siblings, so `:nth-child(2)` picked the wrong
    // one. Match order is what tracks the real layout.
    const items = ['Software Development', 'Redmond, Washington', '29M followers', '10K+ employees']
      .map((t) => `<li class="org-top-card-summary-info-list__info-item">${t}</li>`)
      .join('<span>·</span>');
    const u = new URL('https://www.linkedin.com/company/microsoft');
    const c = pickAdapter(u).parse(html({ body: `<ul>${items}</ul>` }), u);
    expect(c.industry).toBe('Software Development');
    expect(c.location).toBe('Redmond, Washington');
  });

  test('a company with no location listed leaves it empty, not a follower count', () => {
    const items = ['Software Development', '29M followers']
      .map((t) => `<li class="org-top-card-summary-info-list__info-item">${t}</li>`)
      .join('');
    const u = new URL('https://www.linkedin.com/company/microsoft');
    const c = pickAdapter(u).parse(html({ body: `<ul>${items}</ul>` }), u);
    expect(c.industry).toBe('Software Development');
    expect(c.location).toBeNull();
  });

  test('a page with nothing parseable yields an empty name rather than throwing', () => {
    // A throw here would break the extension every time LinkedIn ships new
    // markup; an empty editable field is a fine outcome.
    expect(pickAdapter(url).parse(html({}), url).name).toBe('');
  });
});

describe('shared URL rules', () => {
  test('the extension and the server normalise identically', async () => {
    // If these ever disagree, the extension asks "do you have this URL?" about
    // a string the server would have stored differently, and every capture
    // looks new.
    const { cleanUrl: pure } = await import('../src/lib/cleanUrl');
    const { cleanUrl: server } = await import('../src/lib/server/url');
    for (const raw of [
      'https://www.linkedin.com/in/satyanadella/en?trk=abc',
      'https://x.com/elonmusk?s=20',
      'https://example.com/docs/#top'
    ]) {
      expect(pure(raw)).toBe(server(raw));
    }
  });

  test('the content script normalises before sending, not just the server', () => {
    // `content.ts` applies cleanUrl to location.href. It is imported from the
    // app rather than copied, which is what keeps the two in step; this asserts
    // the import is actually used and not merely present in tsconfig.
    const source = readFileSync('extension/src/content.ts', 'utf8');
    expect(source).toContain("from '../../src/lib/cleanUrl'");
    expect(source).toMatch(/url:\s*safeClean\(location\.href\)/);
  });
});
