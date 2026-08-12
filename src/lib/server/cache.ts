import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';

// Content types we'll gzip on the fly. Static assets are precompressed at
// build time by adapter-node — this list is for dynamic SSR/API responses.
const COMPRESSIBLE = /^(text\/|application\/(?:json|javascript|xml|ld\+json|manifest\+json|rss\+xml|atom\+xml))/i;

export function isCompressibleType(contentType: string | null): boolean {
  if (!contentType) return false;
  return COMPRESSIBLE.test(contentType);
}

function appendVaryToHeaders(headers: Headers, value: string): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', value);
  } else if (!new RegExp(`\\b${value}\\b`, 'i').test(existing)) {
    headers.set('Vary', `${existing}, ${value}`);
  }
}

function appendVary(res: Response, value: string): void {
  appendVaryToHeaders(res.headers, value);
}

// Authed HTML / mutation responses: never cache. Vary on Cookie so any
// CDN that does ignore Cache-Control still keys by session.
export function setPrivate(res: Response): void {
  if (!res.headers.has('Cache-Control')) {
    res.headers.set('Cache-Control', 'private, no-store');
  }
  appendVary(res, 'Cookie');
}

// Authed JSON GETs: client may cache locally + revalidate. Pair with ETag so
// the revalidation roundtrip returns 304 instead of the full payload.
export function setPrivateRevalidate(res: Response): void {
  res.headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
  appendVary(res, 'Cookie');
}

export function weakEtag(body: string | Buffer): string {
  const h = createHash('sha1').update(body).digest('base64').replace(/=+$/, '');
  return `W/"${h}"`;
}

export function ifNoneMatch(request: Request, etag: string): boolean {
  const inm = request.headers.get('If-None-Match');
  if (!inm) return false;
  return inm.split(',').some((t) => t.trim() === etag);
}

// Pipe a Response's body through gzip when the client accepts it and the
// payload is worth compressing. Preserves streaming — small responses below
// MIN_COMPRESS_BYTES (when Content-Length is known) pass through untouched.
const MIN_COMPRESS_BYTES = 256;

/**
 * zlib allocates its window and hash chains per stream, in *native* memory that
 * `--max-old-space-size` does not bound and heap snapshots do not show — but the
 * OOM killer on a 1 GB VPS counts it. At the defaults (windowBits 15, memLevel 8)
 * that is ~256 KB per concurrent response; memLevel 7 halves the hash chains for
 * a compression-ratio difference in the noise on the JSON and HTML we send.
 *
 * Level 6 is zlib's own default, stated here rather than implied so the two
 * knobs sit together.
 */
const GZIP_OPTIONS = { level: 6, memLevel: 7 } as const;

export function maybeCompress(response: Response, acceptEncoding: string | null): Response {
  if (!acceptEncoding || !/\bgzip\b/i.test(acceptEncoding)) return response;
  if (response.headers.has('Content-Encoding')) return response;
  if (response.status === 204 || response.status === 304) return response;
  if (!response.body) return response;
  if (!isCompressibleType(response.headers.get('Content-Type'))) return response;
  const len = response.headers.get('Content-Length');
  if (len !== null && Number(len) < MIN_COMPRESS_BYTES) return response;

  const gz = createGzip(GZIP_OPTIONS);
  const piped = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]).pipe(gz);
  const body = Readable.toWeb(piped) as ReadableStream;
  const headers = new Headers(response.headers);
  headers.set('Content-Encoding', 'gzip');
  headers.delete('Content-Length');
  appendVaryToHeaders(headers, 'Accept-Encoding');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Returns 304 when the client's If-None-Match matches; otherwise a JSON
// response with ETag + private revalidate headers set.
export function jsonWithEtag(request: Request, data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data);
  const etag = weakEtag(body);
  if (ifNoneMatch(request, etag)) {
    const res = new Response(null, { status: 304, headers: { ETag: etag } });
    setPrivateRevalidate(res);
    return res;
  }
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('ETag', etag);
  const res = new Response(body, { ...init, headers });
  setPrivateRevalidate(res);
  return res;
}
