import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchGuarded, readCappedBytes, withTimeout } from './fetchGuard';
import { BROWSER_UA } from './og';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

export function avatarsDir(): string {
  return process.env.AVATARS_DIR ?? './data/avatars';
}

export function avatarPath(file: string): string {
  return join(avatarsDir(), file);
}

/**
 * The redirect-following SSRF guard used to be reimplemented here, line for
 * line: the same manual-redirect loop, the same `assertPublicUrl` per hop, the
 * same `bad_scheme` throw, and a private copy of the capped read. Two copies of
 * the guard meant two things to audit and two places for a fix to be applied to
 * only one of. `fetchGuard.ts` is the one implementation now.
 *
 * The redirect budget stays at this module's own 5 rather than the shared
 * default of 7 — an avatar that needs more than five hops is not worth chasing.
 */
async function fetchImageBytes(
  start: URL,
  signal: AbortSignal
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const res = await fetchGuarded(start, {
    signal,
    maxRedirects: MAX_REDIRECTS,
    headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' }
  });

  // A 3xx here is the no-Location case fetchGuarded hands back unfollowed.
  if (res.status >= 300) {
    try { await res.body?.cancel(); } catch { /* noop */ }
    return null;
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (!ct.startsWith('image/')) {
    try { await res.body?.cancel(); } catch { /* noop */ }
    return null;
  }

  const bytes = await readCappedBytes(res, MAX_BYTES);
  return bytes ? { bytes, contentType: ct } : null;
}

export async function cacheRemoteImage(remoteUrl: string | null | undefined): Promise<string | null> {
  if (!remoteUrl) return null;
  let url: URL;
  try {
    url = new URL(remoteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const { signal, done } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const result = await fetchImageBytes(url, signal);
    if (!result) return null;
    const ext = EXT_BY_MIME[result.contentType];
    if (!ext) return null;
    const hash = createHash('sha256').update(result.bytes).digest('hex');
    const filename = `${hash}.${ext}`;
    const dir = avatarsDir();
    const finalPath = join(dir, filename);
    try {
      await stat(finalPath);
      // Already cached.
      return `/avatars/${filename}`;
    } catch {
      // Not cached yet.
    }
    await mkdir(dir, { recursive: true });
    const tmpPath = join(tmpdir(), `heli-avatar-${hash}.${ext}.tmp`);
    await writeFile(tmpPath, result.bytes);
    try {
      await rename(tmpPath, finalPath);
    } catch {
      // Cross-device rename failure or race — fall back to direct write.
      await writeFile(finalPath, result.bytes);
    }
    return `/avatars/${filename}`;
  } catch (err) {
    console.warn('[heli] image cache failed:', (err as Error).message);
    return null;
  } finally {
    done();
  }
}
