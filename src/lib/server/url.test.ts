import { describe, expect, test } from 'vitest';
import { assertPublicUrl, cleanUrl, domainOf, UrlError } from './url';

/**
 * The SSRF guard is ~60 lines of hand-rolled CIDR logic standing between the
 * `/api/save` endpoint and this server's own network. Every case below is a
 * literal address or a local hostname, so nothing here touches DNS.
 */

async function codeFor(input: string): Promise<string> {
  try {
    await assertPublicUrl(input);
    return 'allowed';
  } catch (err) {
    return err instanceof UrlError ? err.code : 'unknown';
  }
}

describe('assertPublicUrl rejects private and reserved space', () => {
  const blocked = [
    'http://127.0.0.1/',
    'http://127.1.2.3/',
    'http://0.0.0.0/',
    'http://10.0.0.1/',
    'http://172.16.0.1/',
    'http://172.31.255.254/',
    'http://192.168.1.1/',
    // Cloud metadata — the single most valuable SSRF target.
    'http://169.254.169.254/latest/meta-data/',
    // CGNAT, which a lot of guards forget.
    'http://100.64.0.1/',
    'http://100.127.255.255/',
    'http://192.0.0.1/',
    'http://192.0.2.1/',
    'http://198.18.0.1/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    // IPv6 loopback, unique-local, link-local, multicast.
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    // IPv4-mapped IPv6 — the classic bypass. Note that `new URL()` rewrites
    // these to the hex form (`::ffff:7f00:1`), so a check written against the
    // dotted spelling never fires.
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/',
    // Deprecated IPv4-compatible form.
    'http://[::127.0.0.1]/',
    // NAT64 and 6to4, which also carry an embedded IPv4 address.
    'http://[64:ff9b::127.0.0.1]/',
    'http://[2002:7f00:1::]/',
    // Discard and documentation prefixes.
    'http://[100::1]/',
    'http://[2001:db8::1]/'
  ];

  for (const url of blocked) {
    test(url, async () => {
      expect(await codeFor(url)).toBe('private_address');
    });
  }
});

describe('assertPublicUrl rejects local hostnames before DNS', () => {
  for (const url of [
    'http://localhost/',
    'http://foo.localhost/',
    'http://db.local/',
    'http://metadata.internal/'
  ]) {
    test(url, async () => {
      expect(await codeFor(url)).toBe('private_address');
    });
  }
});

test('a zone id never reaches the guard — the URL parser rejects it first', async () => {
  // Documented rather than asserted as `private_address`: `new URL()` refuses
  // a scoped address outright, so expandIPv6's zone handling is belt-and-braces
  // for any caller that passes a bare host string instead of a URL.
  expect(() => new URL('http://[fe80::1%eth0]/')).toThrow();
  await expect(assertPublicUrl('http://[fe80::1%25eth0]/')).rejects.toThrow();
});

test('assertPublicUrl rejects non-http(s) schemes', async () => {
  expect(await codeFor('ftp://example.com/')).toBe('bad_scheme');
  expect(await codeFor('file:///etc/passwd')).toBe('bad_scheme');
});

test('assertPublicUrl allows a public literal address', async () => {
  await expect(assertPublicUrl('http://93.184.216.34/')).resolves.toBeInstanceOf(URL);
  await expect(assertPublicUrl('http://[2606:2800:220:1:248:1893:25c8:1946]/')).resolves.toBeInstanceOf(URL);
});

describe('cleanUrl', () => {
  test('adds https:// to a bare host', () => {
    expect(cleanUrl('stripe.com')).toBe('https://stripe.com/');
  });

  test('rejects non-http(s) schemes', () => {
    expect(() => cleanUrl('javascript:alert(1)')).toThrow(UrlError);
    expect(() => cleanUrl('')).toThrow(UrlError);
  });

  test('strips tracking parameters', () => {
    expect(cleanUrl('https://example.com/a?utm_source=x&keep=1&fbclid=y')).toBe(
      'https://example.com/a?keep=1'
    );
  });

  test('normalizes a LinkedIn profile down to the slug', () => {
    expect(cleanUrl('https://www.linkedin.com/in/satyanadella/en?trk=abc&miniProfile=z')).toBe(
      'https://www.linkedin.com/in/satyanadella'
    );
    expect(cleanUrl('https://linkedin.com/in/satyanadella/details/experience')).toBe(
      'https://linkedin.com/in/satyanadella'
    );
    expect(cleanUrl('https://www.linkedin.com/company/stripe/about/')).toBe(
      'https://www.linkedin.com/company/stripe'
    );
  });

  test('strips X share-tracking params from a profile', () => {
    expect(cleanUrl('https://x.com/elonmusk?s=20&t=abc')).toBe('https://x.com/elonmusk');
  });

  test('drops the fragment and the trailing slash', () => {
    expect(cleanUrl('https://example.com/docs/#section')).toBe('https://example.com/docs');
  });

  test('lowercases the hostname', () => {
    expect(cleanUrl('https://EXAMPLE.com/Path')).toBe('https://example.com/Path');
  });
});

test('domainOf drops the www prefix', () => {
  expect(domainOf('https://www.stripe.com/pricing')).toBe('stripe.com');
  expect(domainOf('https://news.ycombinator.com')).toBe('news.ycombinator.com');
});
