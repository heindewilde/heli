import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

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

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.').map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped: ::ffff:a.b.c.d
  const m = lower.match(/^::ffff:([0-9.]+)$/);
  if (m) return isPrivateIPv4(m[1]);
  return false;
}

export async function assertPublicUrl(input: URL | string): Promise<URL> {
  const u = typeof input === 'string' ? new URL(input) : input;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UrlError('bad_scheme', 'Only http(s) URLs are supported');
  }
  const host = u.hostname;
  const ipKind = isIP(host);
  if (ipKind === 4) {
    if (isPrivateIPv4(host)) throw new UrlError('private_address', 'URL points to a private address');
    return u;
  }
  if (ipKind === 6) {
    if (isPrivateIPv6(host)) throw new UrlError('private_address', 'URL points to a private address');
    return u;
  }
  // Reject obvious local hostnames before doing DNS (faster + safer if DNS is hijacked).
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UrlError('private_address', 'URL points to a local hostname');
  }
  let resolved: { address: string; family: number }[];
  try {
    resolved = await dnsLookup(host, { all: true });
  } catch {
    throw new UrlError('dns_failed', 'DNS lookup failed');
  }
  for (const r of resolved) {
    if (r.family === 4 && isPrivateIPv4(r.address)) {
      throw new UrlError('private_address', 'URL resolves to a private address');
    }
    if (r.family === 6 && isPrivateIPv6(r.address)) {
      throw new UrlError('private_address', 'URL resolves to a private address');
    }
  }
  return u;
}
