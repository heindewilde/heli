import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPublicUrl, UrlError } from './url';
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

async function fetchImageBytes(start: URL, signal: AbortSignal): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' }
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      const next = new URL(loc, url);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new UrlError('bad_scheme', 'Redirect to non-http scheme');
      }
      try { await res.body?.cancel(); } catch { /* noop */ }
      url = next;
      continue;
    }
    if (res.status >= 400) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ct.startsWith('image/')) {
      try { await res.body?.cancel(); } catch { /* noop */ }
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* noop */ }
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { bytes, contentType: ct };
  }
  return null;
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const result = await fetchImageBytes(url, ctrl.signal);
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
    clearTimeout(timer);
  }
}
