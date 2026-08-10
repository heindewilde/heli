import { assertPublicUrl, UrlError } from './url';

/**
 * Outbound HTTP with the SSRF guard applied on **every hop**.
 *
 * `fetch` follows redirects itself, which makes checking only the input URL
 * useless: a public URL can 302 straight to 169.254.169.254 and the guard never
 * sees it. So redirects are manual and `assertPublicUrl` runs again before each
 * one is followed.
 *
 * This lived as a private `fetchOnce` inside og.ts. CLAUDE.md has described it
 * as shared (`fetchWithRedirectGuard`) for some time; it was not, and calendar
 * ingestion is the second caller that makes it worth actually being so.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 7;

export type FetchGuardOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxRedirects?: number;
};

export async function fetchGuarded(
  start: URL | string,
  options: FetchGuardOptions = {}
): Promise<Response> {
  let url = typeof start === 'string' ? new URL(start) : start;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let lastResponse: Response | null = null;

  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: options.signal,
      headers: options.headers
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
      try {
        await res.body?.cancel();
      } catch {
        /* noop */
      }
      url = next;
      continue;
    }

    lastResponse = res;
    break;
  }

  if (!lastResponse) throw new UrlError('too_many_redirects', 'Too many redirects');
  return lastResponse;
}

/**
 * Read a body with a hard byte cap, so a hostile or merely enormous response
 * cannot exhaust memory. Returns what fitted.
 */
export async function readCapped(res: Response, maxBytes = DEFAULT_MAX_BYTES): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* noop */
      }
      break;
    }
  }
  out += decoder.decode();
  return out;
}

export function withTimeout(ms = DEFAULT_TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
