// URL normalisation, with no Node dependencies.
//
// Split out of src/lib/server/url.ts so the browser extension can share it:
// that module imports `node:dns` for the SSRF guard, which cannot be bundled
// for a content script. These forty lines of tracking-parameter and
// LinkedIn/X path rules are exactly the ones that must *not* drift between the
// extension and the server — if they do, the extension asks "do you have this
// URL?" about a string the server would have stored differently, and every
// capture looks new.
//
// `assertPublicUrl` deliberately stays server-only.

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
  'fbclid', 'gclid', 'gclsrc', 'msclkid', 'dclid',
  'mc_cid', 'mc_eid',
  'igshid',
  '_hsenc', '_hsmi', 'hsCtaTracking',
  'vero_id', 'vero_conv',
  'mkt_tok',
  'yclid',
  'ref_src', 'ref_url',
  // LinkedIn — tracking + session telemetry that ride on shared profile links.
  'miniProfile', 'miniCompanyUrn', 'trackingId', 'refId', 'originalSubdomain',
  'lipi', 'lici', 'original_referer', 'original_referer_id', 'trk', 'trkInfo',
  'midToken', 'midSig', 'eBP', 'lgCta', 'lgsig',
  // X / Twitter — share-button tracking pair.
  's', 't'
];

export class UrlError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function cleanUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new UrlError('empty', 'URL is empty');
  if (!/^https?:\/\//i.test(raw)) {
    if (/^[a-z]+:\/\//i.test(raw)) {
      throw new UrlError('bad_scheme', 'Only http(s) URLs are supported');
    }
    raw = 'https://' + raw;
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UrlError('parse_failed', 'Could not parse URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UrlError('bad_scheme', 'Only http(s) URLs are supported');
  }
  u.hostname = u.hostname.toLowerCase();
  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  // LinkedIn/X never use query params legitimately on profile/company pages.
  // Drop anything that survived the generic strip, and trim any trailing path
  // segments LinkedIn appends (language codes like `/en`, legacy `/pub`
  // multi-segment URLs, `/details/...` sub-views). The handle/slug is the
  // first segment after the prefix.
  const bareHost = u.hostname.replace(/^www\./, '');
  if (bareHost.endsWith('linkedin.com')) {
    const m = u.pathname.match(/^\/(in|company|school|showcase)\/([^/]+)/i);
    if (m) {
      u.pathname = `/${m[1].toLowerCase()}/${m[2]}`;
      u.search = '';
    } else if (/^\/pub\/([^/]+)/i.test(u.pathname)) {
      const pm = u.pathname.match(/^\/pub\/([^/]+)/i);
      if (pm) {
        u.pathname = `/pub/${pm[1]}`;
        u.search = '';
      }
    }
  } else if ((bareHost === 'x.com' || bareHost === 'twitter.com') && /^\/[^/]+\/?$/.test(u.pathname)) {
    u.search = '';
  }
  // Drop trailing slash on the path (but keep the bare "/").
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }
  // Drop the fragment — almost always client-side noise for our purposes.
  u.hash = '';
  return u.toString();
}

export function domainOf(input: URL | string): string {
  const u = typeof input === 'string' ? new URL(input) : input;
  return u.hostname.replace(/^www\./, '');
}

