import { expect, test } from 'vitest';
import { classify, deriveHandle, humanizeHandle } from './classify';

// Ported from the old `scripts/check-classify.ts`, which ran as its own step in
// `npm run check`. Same cases, now inside the suite.
const cases: { url: string; kind: 'person' | 'company'; handle?: string | null }[] = [
  { url: 'https://www.linkedin.com/in/satyanadella', kind: 'person', handle: 'satyanadella' },
  { url: 'https://linkedin.com/in/satyanadella', kind: 'person', handle: 'satyanadella' },
  { url: 'https://www.linkedin.com/pub/jane-doe/12/345/678', kind: 'person' },
  { url: 'https://github.com/torvalds', kind: 'person', handle: 'torvalds' },
  { url: 'https://github.com/vercel/next.js', kind: 'company' },
  { url: 'https://x.com/elonmusk', kind: 'person', handle: 'elonmusk' },
  { url: 'https://twitter.com/elonmusk', kind: 'person', handle: 'elonmusk' },
  { url: 'https://bsky.app/profile/example.bsky.social', kind: 'person' },
  { url: 'https://www.tiktok.com/@charlidamelio', kind: 'person', handle: 'charlidamelio' },
  { url: 'https://youtube.com/@mkbhd', kind: 'person', handle: 'mkbhd' },
  { url: 'https://medium.com/@dhh', kind: 'person', handle: 'dhh' },
  { url: 'https://stripe.com', kind: 'company' },
  { url: 'https://www.stripe.com', kind: 'company' },
  { url: 'https://news.ycombinator.com', kind: 'company' },
  { url: 'https://example.com/about', kind: 'company' },
  { url: 'https://anthropic.com', kind: 'company' }
];

for (const c of cases) {
  test(`${c.kind.padEnd(7)} ${c.url}`, () => {
    const u = new URL(c.url);
    expect(classify(u)).toBe(c.kind);
    if (c.handle !== undefined) {
      expect(deriveHandle(u)).toBe(c.handle);
    }
  });
}

test('humanizeHandle turns a slug into a name', () => {
  expect(humanizeHandle('satyanadella')).toBeTruthy();
  expect(humanizeHandle(null)).toBeNull();
  expect(humanizeHandle(undefined)).toBeNull();
});
