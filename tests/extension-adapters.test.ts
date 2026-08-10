import { describe, expect, test } from 'vitest';

/**
 * The extension's adapters, exercised against real-shaped markup.
 *
 * These run in the app's suite rather than the extension's, because the
 * extension has no test runner and this is the code most likely to rot: site
 * markup changes, and the failure mode is silent — a field arrives empty and
 * nobody notices until someone captures a blank record.
 *
 * `resolve`/`jsonLd`/`meta`/`css` only touch `Document`, so a minimal stub is
 * enough and the suite stays node-only.
 */

// A tiny DOM good enough for the strategies: querySelector by a handful of
// selector shapes, plus textContent/content/title.
type Node = { selector: string; text?: string; content?: string };

function fakeDoc(opts: { title?: string; nodes?: Node[]; jsonLd?: unknown[] }): Document {
  const nodes = opts.nodes ?? [];
  const ldNodes = (opts.jsonLd ?? []).map((v) => ({ textContent: JSON.stringify(v) }));
  return {
    title: opts.title ?? '',
    querySelector(sel: string) {
      // Strategies pass either a CSS selector we planted, or the meta form.
      const metaMatch = /^meta\[property="([^"]+)"\], meta\[name="\1"\]$/.exec(sel);
      if (metaMatch) {
        const hit = nodes.find((n) => n.selector === `meta:${metaMatch[1]}`);
        return hit ? { content: hit.content } : null;
      }
      const hit = nodes.find((n) => n.selector === sel);
      return hit ? { textContent: hit.text } : null;
    },
    querySelectorAll(sel: string) {
      if (sel === 'script[type="application/ld+json"]') return ldNodes;
      return [];
    }
  } as unknown as Document;
}

const { pickAdapter } = await import('../extension/src/adapters/index');

describe('adapter selection', () => {
  test('routes each host to its adapter', () => {
    expect(pickAdapter(new URL('https://www.linkedin.com/in/ada')).id).toBe('linkedin');
    expect(pickAdapter(new URL('https://github.com/torvalds')).id).toBe('github');
    expect(pickAdapter(new URL('https://x.com/elonmusk')).id).toBe('x');
    expect(pickAdapter(new URL('https://twitter.com/elonmusk')).id).toBe('x');
    expect(pickAdapter(new URL('https://stripe.com/pricing')).id).toBe('generic');
  });
});

describe('LinkedIn', () => {
  test('a profile parses as a person, preferring JSON-LD over the DOM', () => {
    const doc = fakeDoc({
      jsonLd: [{ name: 'Ada Lovelace', jobTitle: 'Engineer' }],
      nodes: [{ selector: 'h1', text: 'Ada Lovelace | LinkedIn' }]
    });
    const c = pickAdapter(new URL('https://www.linkedin.com/in/ada')).parse(
      doc,
      new URL('https://www.linkedin.com/in/ada')
    );
    expect(c.kind).toBe('person');
    expect(c.name).toBe('Ada Lovelace');
    expect(c.via?.name).toContain('jsonld');
  });

  test('a company page parses as a company', () => {
    const url = new URL('https://www.linkedin.com/company/stripe');
    const doc = fakeDoc({ jsonLd: [{ name: 'Stripe', description: 'Payments' }] });
    const c = pickAdapter(url).parse(doc, url);
    expect(c.kind).toBe('company');
    expect(c.name).toBe('Stripe');
  });

  test('falls back down the strategy list when JSON-LD is absent', () => {
    const url = new URL('https://www.linkedin.com/in/ada');
    const doc = fakeDoc({ nodes: [{ selector: 'h1', text: '  Ada  Lovelace  ' }] });
    const c = pickAdapter(url).parse(doc, url);
    // Also checks whitespace normalisation, which matters because scraped
    // markup is full of it.
    expect(c.name).toBe('Ada Lovelace');
    expect(c.via?.name).toContain('css');
  });

  test('a page with nothing parseable yields an empty name rather than throwing', () => {
    const url = new URL('https://www.linkedin.com/in/ada');
    const c = pickAdapter(url).parse(fakeDoc({}), url);
    // This is the degradation that matters: the popup shows an empty, editable
    // field. A throw here would break the extension every time LinkedIn ships
    // new markup.
    expect(c.name).toBe('');
  });
});

describe('GitHub', () => {
  test('a user is a person', () => {
    const url = new URL('https://github.com/torvalds');
    const c = pickAdapter(url).parse(
      fakeDoc({ nodes: [{ selector: '.vcard-fullname', text: 'Linus Torvalds' }] }),
      url
    );
    expect(c.kind).toBe('person');
    expect(c.name).toBe('Linus Torvalds');
  });

  test('a repo is a company — matching the server classifier', async () => {
    const url = new URL('https://github.com/vercel/next.js');
    const c = pickAdapter(url).parse(fakeDoc({}), url);
    expect(c.kind).toBe('company');

    // The two must agree, or the extension offers to create a person that
    // /api/save would have stored as a company.
    const { classify } = await import('../src/lib/server/classify');
    expect(classify(url)).toBe('company');
  });

  test('falls back to the URL segment when the DOM gives nothing', () => {
    const url = new URL('https://github.com/torvalds');
    expect(pickAdapter(url).parse(fakeDoc({}), url).name).toBe('torvalds');
  });
});

describe('generic', () => {
  test('prefers og:site_name, then og:title, then the title tag', () => {
    const url = new URL('https://stripe.com/pricing');
    const c = pickAdapter(url).parse(
      fakeDoc({ nodes: [{ selector: 'meta:og:site_name', content: 'Stripe' }] }),
      url
    );
    expect(c.kind).toBe('company');
    expect(c.name).toBe('Stripe');
  });

  test('falls back to the bare hostname', () => {
    const url = new URL('https://www.example.com/about');
    expect(pickAdapter(url).parse(fakeDoc({}), url).name).toBe('example.com');
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
});
