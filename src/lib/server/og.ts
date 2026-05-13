import { parse, type HTMLElement } from 'node-html-parser';
import { assertPublicUrl, UrlError } from './url';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 7;

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GOOGLEBOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const COMMON_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br'
};

export type SocialLinks = { linkedinUrl?: string; xUrl?: string };

export type OgData = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  faviconUrl?: string;
  canonicalUrl?: string;
  jsonLd?: Record<string, unknown> | null;
  socials?: SocialLinks;
  address?: string;
  industry?: string;
  sizeBand?: string;
  email?: string;
  phone?: string;
};

async function fetchOnce(start: URL, signal: AbortSignal, ua: string): Promise<Response> {
  let url = start;
  let lastResponse: Response | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': ua, ...COMMON_HEADERS }
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        lastResponse = res;
        break;
      }
      const next = new URL(loc, url);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new UrlError('bad_scheme', 'Redirect to non-http scheme');
      }
      try { await res.body?.cancel(); } catch { /* noop */ }
      url = next;
      continue;
    }
    lastResponse = res;
    break;
  }
  if (!lastResponse) throw new UrlError('too_many_redirects', 'Too many redirects');
  return lastResponse;
}

async function readCappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= MAX_BYTES) {
      try { await reader.cancel(); } catch { /* noop */ }
      break;
    }
  }
  out += decoder.decode();
  return out;
}

const AUTHWALL_PATTERNS = [
  /authwall/i,
  /<title>\s*Sign\s*Up\s*\|\s*LinkedIn/i,
  /<title>\s*LinkedIn\s*Login/i,
  /please\s+log\s+in/i,
  /Just a moment\.\.\./i // Cloudflare interstitial
];

function looksThin(status: number, html: string): boolean {
  if (status >= 400) return true;
  if (html.length < 2048) return true;
  if (!/<title[^>]*>/i.test(html)) return true;
  return AUTHWALL_PATTERNS.some((re) => re.test(html));
}

function pickMeta(doc: HTMLElement, name: string): string | undefined {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ||
    doc.querySelector(`meta[name="${name}"]`);
  const v = el?.getAttribute('content')?.trim();
  return v || undefined;
}

function pickAnyMeta(doc: HTMLElement, names: string[]): string | undefined {
  for (const n of names) {
    const v = pickMeta(doc, n);
    if (v) return v;
  }
  return undefined;
}

function pickLink(doc: HTMLElement, rel: string): string | undefined {
  // node-html-parser doesn't support [rel~="x"]; match exact or whitespace-separated.
  const links = doc.querySelectorAll('link[rel]');
  for (const el of links) {
    const r = el.getAttribute('rel');
    if (!r) continue;
    if (r === rel || r.split(/\s+/).includes(rel)) {
      const v = el.getAttribute('href')?.trim();
      if (v) return v;
    }
  }
  return undefined;
}

function resolveAbs(base: URL, href: string | undefined): string | undefined {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

const RELEVANT_LD_TYPES = new Set([
  'Person', 'Organization', 'Corporation', 'LocalBusiness', 'NewsMediaOrganization',
  'EducationalOrganization', 'GovernmentOrganization', 'NGO', 'OnlineBusiness',
  'ProfilePage', 'WebPage', 'WebSite'
]);

function ldType(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const t = (node as Record<string, unknown>)['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

function pickRelevantLdNode(candidates: unknown[]): Record<string, unknown> | null {
  // First pass: prefer Person / Organization-ish types.
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const types = ldType(c);
    if (types.some((t) => t === 'Person' || t === 'Organization' || t === 'Corporation' || t === 'LocalBusiness')) {
      return c as Record<string, unknown>;
    }
  }
  // Second pass: ProfilePage / WebPage with mainEntity that's relevant.
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    const types = ldType(obj);
    if (types.some((t) => t === 'ProfilePage' || t === 'WebPage')) {
      const main = obj.mainEntity;
      if (main && typeof main === 'object') {
        const mainTypes = ldType(main);
        if (mainTypes.some((t) => RELEVANT_LD_TYPES.has(t))) {
          return main as Record<string, unknown>;
        }
      }
    }
  }
  // Third pass: WebSite with publisher.
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const types = ldType(c);
    if (types.includes('WebSite')) {
      const pub = (c as Record<string, unknown>).publisher;
      if (pub && typeof pub === 'object') return pub as Record<string, unknown>;
    }
  }
  // Last resort: any object with @type.
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    if (ldType(c).length > 0) return c as Record<string, unknown>;
  }
  return null;
}

function parseJsonLd(doc: HTMLElement): Record<string, unknown> | null {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  const all: unknown[] = [];
  for (const b of blocks) {
    const raw = b.textContent?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      all.push(...parsed);
    } else if (parsed && typeof parsed === 'object' && '@graph' in (parsed as Record<string, unknown>)) {
      const g = (parsed as Record<string, unknown>)['@graph'];
      if (Array.isArray(g)) all.push(...g);
      else all.push(parsed);
    } else {
      all.push(parsed);
    }
  }
  return pickRelevantLdNode(all);
}

const SOCIAL_HOSTS = {
  linkedin: /(^|\.)linkedin\.com$/i,
  x: /^(x\.com|twitter\.com)$/i
};

function classifySocial(rawUrl: string): { kind: 'linkedin' | 'x'; url: string } | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (SOCIAL_HOSTS.linkedin.test(host)) return { kind: 'linkedin', url: u.toString() };
  if (SOCIAL_HOSTS.x.test(host)) return { kind: 'x', url: u.toString() };
  return null;
}

export function extractSocialLinks(doc: HTMLElement, base: URL): SocialLinks {
  const out: SocialLinks = {};
  // 1) <a href> walk — covers footers, headers, "follow us" lists.
  const anchors = doc.querySelectorAll('a[href]');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    const abs = resolveAbs(base, href);
    if (!abs) continue;
    const m = classifySocial(abs);
    if (!m) continue;
    if (m.kind === 'linkedin' && !out.linkedinUrl) out.linkedinUrl = m.url;
    else if (m.kind === 'x' && !out.xUrl) out.xUrl = m.url;
    if (out.linkedinUrl && out.xUrl) break;
  }
  return out;
}

function isLinkedInHost(u: URL): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  return h === 'linkedin.com' || h.endsWith('.linkedin.com');
}

function isImagePoor(html: string): boolean {
  // Page rendered fine but the profile photo / og:image isn't present.
  // LinkedIn serves a "public profile view" with name + headline but
  // deliberately omits the photo for non-logged-in viewers.
  return !/<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image|twitter:image)/i.test(html);
}

export async function fetchOg(url: URL | string): Promise<OgData> {
  const target = typeof url === 'string' ? new URL(url) : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // LinkedIn is hostile to ordinary browser UAs but serves more to
    // Googlebot. For LinkedIn hosts, try Googlebot first.
    const linkedin = isLinkedInHost(target);
    const firstUa = linkedin ? GOOGLEBOT_UA : BROWSER_UA;
    const secondUa = linkedin ? BROWSER_UA : GOOGLEBOT_UA;

    let res = await fetchOnce(target, ctrl.signal, firstUa);
    let finalUrl = new URL(res.url || target.toString(), target);
    let ct = res.headers.get('content-type') || '';

    if (!ct.includes('html') && !ct.includes('xml')) {
      return {
        faviconUrl: new URL('/favicon.ico', finalUrl).toString(),
        canonicalUrl: finalUrl.toString()
      };
    }

    let html = await readCappedText(res);

    // Pass 2: retry with the other UA if pass 1 is auth-walled OR (for
    // LinkedIn) is missing the og:image — a common pattern there.
    const shouldRetry = looksThin(res.status, html) || (linkedin && isImagePoor(html));
    if (shouldRetry) {
      try {
        const res2 = await fetchOnce(target, ctrl.signal, secondUa);
        const ct2 = res2.headers.get('content-type') || '';
        if (ct2.includes('html') || ct2.includes('xml')) {
          const html2 = await readCappedText(res2);
          const retryGotImage = !isImagePoor(html2);
          const retryIsBetter =
            !looksThin(res2.status, html2) ||
            html2.length > html.length * 1.5 ||
            (linkedin && retryGotImage && isImagePoor(html));
          if (retryIsBetter) {
            html = html2;
            finalUrl = new URL(res2.url || target.toString(), target);
          }
        }
      } catch {
        // Retry is best-effort.
      }
    }

    const doc = parse(html, {
      blockTextElements: { script: true, style: true, pre: false }
    });

    const rawTitle =
      pickAnyMeta(doc, ['og:title', 'twitter:title']) ||
      doc.querySelector('title')?.textContent?.trim() ||
      undefined;
    const description = pickAnyMeta(doc, ['og:description', 'twitter:description', 'description']);
    const image =
      resolveAbs(finalUrl, pickAnyMeta(doc, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']));
    const siteName = pickMeta(doc, 'og:site_name') ?? defaultSiteName(finalUrl);
    const canonical = resolveAbs(
      finalUrl,
      pickLink(doc, 'canonical') || pickMeta(doc, 'og:url')
    );
    const favicon =
      resolveAbs(finalUrl, pickLink(doc, 'icon')) ||
      resolveAbs(finalUrl, pickLink(doc, 'shortcut')) ||
      resolveAbs(finalUrl, pickLink(doc, 'apple-touch-icon')) ||
      new URL('/favicon.ico', finalUrl).toString();
    const jsonLd = parseJsonLd(doc);

    const socials = extractSocialLinks(doc, finalUrl);
    const sameAsSocials = pickJsonLdSameAsSocials(jsonLd);
    if (sameAsSocials.linkedinUrl && !socials.linkedinUrl) socials.linkedinUrl = sameAsSocials.linkedinUrl;
    if (sameAsSocials.xUrl && !socials.xUrl) socials.xUrl = sameAsSocials.xUrl;

    return {
      title: rawTitle,
      description,
      image,
      siteName,
      faviconUrl: favicon,
      canonicalUrl: canonical ?? finalUrl.toString(),
      jsonLd,
      socials,
      address: pickJsonLdAddress(jsonLd),
      industry: pickJsonLdIndustry(jsonLd),
      sizeBand: pickJsonLdSize(jsonLd),
      email: pickJsonLdContact(jsonLd).email,
      phone: pickJsonLdContact(jsonLd).telephone
    };
  } finally {
    clearTimeout(timer);
  }
}

// Require at least one space before the separator so we don't accidentally
// clip compound surnames like "Smith-Jones" or "O'Brien-Murphy". Pipe / em-dash
// / en-dash / bullet style separators in real titles always have a leading
// space; only the bare hyphen is the edge case we're protecting.
const SITE_SUFFIX_RE = /\s+[—–|·•:\-]\s*[^|·•\-]+$/;

const HOST_SITE_NAME: Array<{ test: (host: string) => boolean; name: string }> = [
  { test: (h) => h === 'linkedin.com' || h.endsWith('.linkedin.com'), name: 'LinkedIn' },
  { test: (h) => h === 'x.com', name: 'X' },
  { test: (h) => h === 'twitter.com', name: 'Twitter' },
  { test: (h) => h === 'github.com', name: 'GitHub' },
  { test: (h) => h === 'medium.com' || h.endsWith('.medium.com'), name: 'Medium' },
  { test: (h) => h === 'youtube.com' || h === 'm.youtube.com', name: 'YouTube' },
  { test: (h) => h === 'tiktok.com' || h.endsWith('.tiktok.com'), name: 'TikTok' },
  { test: (h) => h === 'facebook.com' || h.endsWith('.facebook.com'), name: 'Facebook' },
  { test: (h) => h === 'instagram.com', name: 'Instagram' },
  { test: (h) => h === 'threads.net', name: 'Threads' },
  { test: (h) => h === 'bsky.app', name: 'Bluesky' },
  { test: (h) => h === 'substack.com' || h.endsWith('.substack.com'), name: 'Substack' }
];

function defaultSiteName(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const m of HOST_SITE_NAME) {
    if (m.test(host)) return m.name;
  }
  return undefined;
}

export function stripSiteSuffix(title: string | undefined, knownSite?: string): string | undefined {
  if (!title) return undefined;
  let t = title.trim();
  if (knownSite) {
    const re = new RegExp(`\\s*[\\u2014\\u2013|·•:\\-]\\s*${knownSite.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i');
    t = t.replace(re, '');
  }
  // Generic: strip a trailing " - <site>" / " | <site>" if it's short enough to be a site name.
  const m = t.match(SITE_SUFFIX_RE);
  if (m && m[0].length < 40) {
    const without = t.slice(0, t.length - m[0].length).trim();
    if (without.length >= 2) t = without;
  }
  return t || undefined;
}

// Strip a known company name from the end of a person's name. Handles the
// common LinkedIn / social formats that combine name + employer in the title:
//   "John Doe - Acme Corp"   "John Doe | Acme Corp"   "John Doe – Acme"
//   "John Doe at Acme"       "John Doe @ Acme"        "John Doe (Acme)"
//   "John Doe, Acme Corp"
// We use the explicit company name we already extracted from JSON-LD, so this
// is targeted — it won't accidentally strip a legitimate part of someone's
// name.
export function stripCompanySuffix(name: string | undefined, companyName?: string | null): string | undefined {
  if (!name) return undefined;
  const co = companyName?.trim();
  if (!co) return name;
  const escaped = co.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let s = name.trim();
  const patterns = [
    new RegExp(`\\s*[\\u2014\\u2013|·•:\\-]\\s*${escaped}\\s*$`, 'i'),
    new RegExp(`\\s+(?:at|@)\\s+${escaped}\\s*$`, 'i'),
    new RegExp(`\\s*\\(\\s*${escaped}\\s*\\)\\s*$`, 'i'),
    new RegExp(`\\s*,\\s*${escaped}\\s*$`, 'i')
  ];
  for (const re of patterns) {
    const next = s.replace(re, '').trim();
    if (next.length >= 2) s = next;
  }
  return s || undefined;
}

export function pickJsonLdString(node: Record<string, unknown> | null | undefined, key: string): string | undefined {
  if (!node) return undefined;
  const v = node[key];
  if (typeof v === 'string') return v;
  return undefined;
}

export function pickJsonLdImage(node: Record<string, unknown> | null | undefined): string | undefined {
  if (!node) return undefined;
  const img = node.image;
  if (!img) return undefined;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    for (const item of img) {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const url = obj.contentUrl ?? obj.url;
        if (typeof url === 'string') return url;
      }
    }
    return undefined;
  }
  if (typeof img === 'object') {
    const obj = img as Record<string, unknown>;
    const url = obj.contentUrl ?? obj.url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

export function pickJsonLdWorksFor(node: Record<string, unknown> | null | undefined): { name?: string; url?: string } | null {
  if (!node) return null;
  const w = node.worksFor;
  if (!w) return null;
  if (typeof w === 'object' && !Array.isArray(w)) {
    const obj = w as Record<string, unknown>;
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined
    };
  }
  if (Array.isArray(w) && w.length > 0 && w[0] && typeof w[0] === 'object') {
    const obj = w[0] as Record<string, unknown>;
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      url: typeof obj.url === 'string' ? obj.url : undefined
    };
  }
  return null;
}

export function pickJsonLdAddress(node: Record<string, unknown> | null | undefined): string | undefined {
  if (!node) return undefined;
  const a = node.address ?? (node as Record<string, unknown>).location;
  if (!a) return undefined;
  if (typeof a === 'string') return a.trim() || undefined;
  const obj = Array.isArray(a) ? (a[0] as Record<string, unknown> | undefined) : (a as Record<string, unknown>);
  if (!obj || typeof obj !== 'object') return undefined;
  const inner = obj.address && typeof obj.address === 'object' ? (obj.address as Record<string, unknown>) : obj;
  const locality = typeof inner.addressLocality === 'string' ? inner.addressLocality.trim() : '';
  const region = typeof inner.addressRegion === 'string' ? inner.addressRegion.trim() : '';
  const country = typeof inner.addressCountry === 'string'
    ? inner.addressCountry.trim()
    : (inner.addressCountry && typeof inner.addressCountry === 'object'
        ? (((inner.addressCountry as Record<string, unknown>).name as string | undefined)?.trim() ?? '')
        : '');
  const parts = [locality, region, country].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function pickJsonLdSameAsArray(node: Record<string, unknown> | null | undefined): string[] {
  if (!node) return [];
  const s = node.sameAs;
  if (!s) return [];
  if (typeof s === 'string') return [s];
  if (Array.isArray(s)) return s.filter((x): x is string => typeof x === 'string');
  return [];
}

export function pickJsonLdSameAsSocials(node: Record<string, unknown> | null | undefined): SocialLinks {
  const out: SocialLinks = {};
  for (const raw of pickJsonLdSameAsArray(node)) {
    const m = classifySocial(raw);
    if (!m) continue;
    if (m.kind === 'linkedin' && !out.linkedinUrl) out.linkedinUrl = m.url;
    else if (m.kind === 'x' && !out.xUrl) out.xUrl = m.url;
  }
  return out;
}

export function pickJsonLdIndustry(node: Record<string, unknown> | null | undefined): string | undefined {
  if (!node) return undefined;
  const i = node.industry ?? node.naics ?? node.isicV4;
  if (typeof i === 'string' && i.trim()) return i.trim();
  if (Array.isArray(i)) {
    const first = i.find((x) => typeof x === 'string' && x.trim());
    if (first) return (first as string).trim();
  }
  const k = node.knowsAbout;
  if (Array.isArray(k)) {
    const first = k.find((x) => typeof x === 'string' && x.trim());
    if (first) return (first as string).trim();
  }
  if (typeof k === 'string' && k.trim()) return k.trim();
  return undefined;
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/[\d,.]+/);
    if (m) {
      const n = Number(m[0].replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function pickJsonLdSize(node: Record<string, unknown> | null | undefined): string | undefined {
  if (!node) return undefined;
  const raw = node.numberOfEmployees;
  if (!raw) return undefined;
  let n: number | null = null;
  if (typeof raw === 'object' && raw && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    n = parseNumber(obj.value ?? obj.minValue ?? obj.maxValue);
  } else {
    n = parseNumber(raw);
  }
  if (n === null) return undefined;
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 500) return '201-500';
  if (n <= 1000) return '501-1k';
  if (n <= 5000) return '1k-5k';
  return '5k+';
}

export function pickJsonLdContact(node: Record<string, unknown> | null | undefined): { email?: string; telephone?: string } {
  if (!node) return {};
  const out: { email?: string; telephone?: string } = {};
  const email = node.email;
  if (typeof email === 'string' && email.trim()) out.email = email.trim().replace(/^mailto:/i, '');
  const phone = node.telephone;
  if (typeof phone === 'string' && phone.trim()) out.telephone = phone.trim();
  const cp = node.contactPoint;
  if (cp && typeof cp === 'object') {
    const first = Array.isArray(cp) ? cp[0] : cp;
    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>;
      if (!out.email && typeof obj.email === 'string') out.email = obj.email.trim().replace(/^mailto:/i, '');
      if (!out.telephone && typeof obj.telephone === 'string') out.telephone = obj.telephone.trim();
    }
  }
  return out;
}
