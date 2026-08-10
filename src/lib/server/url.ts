import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// The pure half lives in $lib/cleanUrl so the browser extension can import it
// without dragging node:dns into a content-script bundle. Re-exported here so
// every existing server call site is unchanged.
export { cleanUrl, domainOf, UrlError } from '../cleanUrl';
import { UrlError } from '../cleanUrl';

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

/**
 * Expand an IPv6 address to its eight 16-bit groups, or null if it doesn't
 * parse. Handles `::` compression, a trailing dotted-quad, and a zone id.
 *
 * Textual prefix matching is not good enough here: `new URL()` re-serializes
 * `[::ffff:127.0.0.1]` as `::ffff:7f00:1`, so any check written against the
 * dotted form silently stops matching the thing it was written to catch.
 */
function expandIPv6(addr: string): number[] | null {
  let s = addr.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);

  // Trailing dotted-quad (::ffff:127.0.0.1) → rewrite as two hex groups.
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1 && s.slice(lastColon + 1).includes('.')) {
    const quad = s.slice(lastColon + 1).split('.').map((n) => Number.parseInt(n, 10));
    if (quad.length !== 4 || quad.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((quad[0] << 8) | quad[1]).toString(16);
    const lo = ((quad[2] << 8) | quad[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let parts: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    parts = [...head, ...Array<string>(fill).fill('0'), ...tail];
  } else {
    if (head.length !== 8) return null;
    parts = head;
  }

  const groups = parts.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? Number.parseInt(h, 16) : NaN));
  return groups.some((g) => Number.isNaN(g)) ? null : groups;
}

function isPrivateIPv6(addr: string): boolean {
  const g = expandIPv6(addr);
  if (!g) return true; // Unparseable — fail closed.

  // Three families carry a real IPv4 address in the low 32 bits, and each is a
  // known way to smuggle 127.0.0.1 or 169.254.169.254 past a naive check:
  // IPv4-mapped (::ffff:0:0/96), the deprecated IPv4-compatible form (::/96),
  // and NAT64 (64:ff9b::/96). `::` and `::1` fall out of this too, as
  // 0.0.0.0 and 0.0.0.1.
  const zeroHead = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  const nat64 = g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;
  if ((zeroHead && (g[5] === 0xffff || g[5] === 0)) || nat64) {
    return isPrivateIPv4(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  // 6to4 (2002::/16) embeds the IPv4 address in the next 32 bits.
  if (g[0] === 0x2002) {
    return isPrivateIPv4(`${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`);
  }

  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard 100::/64
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation 2001:db8::/32
  return false;
}

export async function assertPublicUrl(input: URL | string): Promise<URL> {
  const u = typeof input === 'string' ? new URL(input) : input;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UrlError('bad_scheme', 'Only http(s) URLs are supported');
  }
  // WHATWG URL keeps the brackets on an IPv6 literal (`[::1]`), and isIP()
  // rejects the bracketed form — which made the entire IPv6 branch below
  // unreachable for anything derived from a URL. It failed closed (the DNS
  // lookup of "[::1]" errors out), but `http://[::ffff:127.0.0.1]/` was being
  // rejected as `dns_failed` rather than as the private address it is, and a
  // legitimate public IPv6 literal was rejected too.
  const host = u.hostname.replace(/^\[|\]$/g, '');
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
