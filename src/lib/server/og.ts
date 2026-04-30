import { JSDOM } from 'jsdom';
import { assertPublicUrl, UrlError } from './url';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'GustoBot/1.0 (+https://gusto.sh)';

export type OgData = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  faviconUrl?: string;
  canonicalUrl?: string;
  jsonLd?: Record<string, unknown> | null;
};

async function fetchWithRedirectGuard(start: URL, signal: AbortSignal): Promise<Response> {
  let url = start;
  let lastResponse: Response | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.5'
      }
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
      // Drain body so the connection is released before the next hop.
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

function pickMeta(doc: Document, name: string): string | undefined {
  const el =
    doc.querySelector(`meta[property="${name}"]`) ||
    doc.querySelector(`meta[name="${name}"]`);
  const v = el?.getAttribute('content')?.trim();
  return v || undefined;
}

function pickLink(doc: Document, rel: string): string | undefined {
  const el = doc.querySelector(`link[rel~="${rel}"]`);
  const v = el?.getAttribute('href')?.trim();
  return v || undefined;
}

function resolveAbs(base: URL, href: string | undefined): string | undefined {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

function parseJsonLd(doc: Document): Record<string, unknown> | null {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const b of blocks) {
    const raw = b.textContent?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && '@graph' in (parsed as Record<string, unknown>)
        ? ((parsed as Record<string, unknown>)['@graph'] as unknown[]) ?? [parsed]
        : [parsed];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const obj = c as Record<string, unknown>;
      const t = obj['@type'];
      if (t === 'Organization' || t === 'Person' || t === 'Corporation' || t === 'LocalBusiness') {
        return obj;
      }
    }
  }
  return null;
}

export async function fetchOg(url: URL | string): Promise<OgData> {
  const target = typeof url === 'string' ? new URL(url) : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchWithRedirectGuard(target, ctrl.signal);
    const finalUrl = new URL(res.url || target.toString(), target);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html') && !ct.includes('xml')) {
      // Non-HTML — bail early; we still hand back a favicon guess from the host root.
      return {
        faviconUrl: new URL('/favicon.ico', finalUrl).toString(),
        canonicalUrl: finalUrl.toString()
      };
    }
    const html = await readCappedText(res);
    const dom = new JSDOM(html, { url: finalUrl.toString() });
    const doc = dom.window.document;

    const title =
      pickMeta(doc, 'og:title') ||
      doc.querySelector('title')?.textContent?.trim() ||
      undefined;
    const description = pickMeta(doc, 'og:description') || pickMeta(doc, 'description');
    const image = resolveAbs(finalUrl, pickMeta(doc, 'og:image'));
    const siteName = pickMeta(doc, 'og:site_name');
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

    return {
      title,
      description,
      image,
      siteName,
      faviconUrl: favicon,
      canonicalUrl: canonical ?? finalUrl.toString(),
      jsonLd
    };
  } finally {
    clearTimeout(timer);
  }
}

const SITE_SUFFIX_RE = /\s*[—–|·•:\-]\s*[^|·•\-]+$/;

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

export function pickJsonLdString(node: Record<string, unknown> | null | undefined, key: string): string | undefined {
  if (!node) return undefined;
  const v = node[key];
  if (typeof v === 'string') return v;
  return undefined;
}

export function pickJsonLdImage(node: Record<string, unknown> | null | undefined): string | undefined {
  if (!node) return undefined;
  const img = node.image;
  if (typeof img === 'string') return img;
  if (img && typeof img === 'object' && 'url' in (img as Record<string, unknown>)) {
    const u = (img as Record<string, unknown>).url;
    if (typeof u === 'string') return u;
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
  return null;
}
