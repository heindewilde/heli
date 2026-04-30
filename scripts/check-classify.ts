import { classify, deriveHandle } from '../src/lib/server/classify';

type Case = { url: string; kind: 'person' | 'company'; handle?: string | null };

const cases: Case[] = [
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

let failures = 0;
for (const c of cases) {
  const u = new URL(c.url);
  const got = classify(u);
  if (got !== c.kind) {
    failures++;
    console.error(`✗ classify(${c.url}) = ${got}, expected ${c.kind}`);
    continue;
  }
  if (c.handle !== undefined) {
    const handle = deriveHandle(u);
    if (handle !== c.handle) {
      failures++;
      console.error(`✗ deriveHandle(${c.url}) = ${handle}, expected ${c.handle}`);
      continue;
    }
  }
  console.log(`✓ ${c.kind.padEnd(7)} ${c.url}`);
}

if (failures > 0) {
  console.error(`\n${failures} classifier failure(s)`);
  process.exit(1);
}
console.log(`\nclassify: ${cases.length} cases passed`);
