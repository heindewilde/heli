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
  // Decode percent-encoded characters first — non-English LinkedIn handles
  // (e.g. `améraaphorst`) get encoded by `new URL(...)`.
  try {
    leaf = decodeURIComponent(leaf);
  } catch {
    // Malformed encoding; keep raw.
  }
  leaf = leaf.replace(/^@/, '');
  // Allow Unicode letters/digits so accented handles aren't rejected.
  if (!/^[\p{L}\p{N}_.\-]+$/u.test(leaf)) return null;
  return leaf || null;
}

export function humanizeHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  let s = handle.trim();
  if (!s) return null;
  // LinkedIn appends a random suffix to disambiguate names — either
  // alphanumeric (`john-doe-83a4b2`) or pure numeric ID (`john-doe-065847151`).
  // Strip the trailing token when it's ≥4 chars and contains a digit; that
  // leaves intentional short suffixes like `john-2nd` (3 chars) untouched.
  const tail = s.match(/[-_.]([A-Za-z0-9]+)$/);
  if (tail && tail[1].length >= 4 && /\d/.test(tail[1])) {
    s = s.slice(0, s.length - tail[0].length);
  }
  const parts = s.split(/[-_.\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const cased = parts.map((p) => {
    // Keep all-caps acronyms (≤4 chars) as-is; otherwise title-case.
    if (p.length <= 4 && p === p.toUpperCase() && /^[A-Z]+$/.test(p)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  });
  const out = cased.join(' ').replace(/\s+/g, ' ').trim();
  return out || null;
}
