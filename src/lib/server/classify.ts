export type Kind = 'person' | 'company';

type HostMatch = { host: string; pathStartsWith?: string };

const PERSON_HOST_PREFIXES: HostMatch[] = [
  { host: 'linkedin.com', pathStartsWith: '/in/' },
  { host: 'linkedin.com', pathStartsWith: '/pub/' },
  { host: 'x.com' },
  { host: 'twitter.com' },
  { host: 'github.com' },
  { host: 'instagram.com' },
  { host: 'threads.net' },
  { host: 'bsky.app', pathStartsWith: '/profile/' },
  { host: 'tiktok.com', pathStartsWith: '/@' },
  { host: 'youtube.com', pathStartsWith: '/@' },
  { host: 'medium.com', pathStartsWith: '/@' },
  { host: 'substack.com', pathStartsWith: '/@' },
  { host: 't.me' },
  { host: 'facebook.com' },
  { host: 'mastodon.social' },
  { host: 'about.me' },
  { host: 'read.cv' },
  { host: 'dribbble.com' },
  { host: 'behance.net' }
];

// Hosts that are usually personal but expose corporate / org-level URLs we
// don't want to misclassify. e.g. github.com/{org}/{repo} is a project, not a
// person.
const COMPANY_PATH_OVERRIDES: Array<{ host: string; segmentCount: number }> = [
  { host: 'github.com', segmentCount: 2 } // /org/repo+
];

function hostMatches(host: string, target: string): boolean {
  return host === target || host.endsWith('.' + target);
}

export function classify(url: URL): Kind {
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname || '/';

  for (const m of PERSON_HOST_PREFIXES) {
    if (!hostMatches(host, m.host)) continue;
    if (m.pathStartsWith && !path.startsWith(m.pathStartsWith)) continue;
    if (!m.pathStartsWith) {
      // Generic hosts (x.com, github.com, etc.): a single non-empty path segment
      // means a profile. Two or more segments usually means a project / status / repo.
      const segments = path.split('/').filter(Boolean);
      const override = COMPANY_PATH_OVERRIDES.find((o) => o.host === m.host);
      if (override && segments.length >= override.segmentCount) return 'company';
      if (segments.length === 0) return 'company'; // bare hostname, not a profile
    }
    return 'person';
  }
  return 'company';
}

export function deriveHandle(url: URL): string | null {
  // Prefer the leaf segment of the path; strip a leading `@` and `/in/` etc.
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  let leaf = segments[segments.length - 1];
  // For LinkedIn /in/<handle> the handle is segment[1]; same logic — leaf works.
  leaf = leaf.replace(/^@/, '');
  if (!/^[A-Za-z0-9_.\-]+$/.test(leaf)) return null;
  return leaf || null;
}
