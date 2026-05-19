/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `heli-${version}`;

// Static assets that ship with this build. Hashed file names mean each version
// gets its own cache — old caches are pruned on activate.
const PRECACHE: string[] = [...build, ...files];

// API endpoints that we serve with stale-while-revalidate. They are private
// per-user data, so we only ever cache responses that came back with
// `Cache-Control: private, max-age=*, must-revalidate` (set in cache.ts).
const SWR_PATHS = /^\/api\/(?:people|companies|projects|interactions|search)(?:\/|\?|$)/;

sw.addEventListener('install', (event) => {
  // Pre-fill the cache so the next navigation is instant. Don't skipWaiting —
  // we want the user to opt in via the update banner so a mid-flight page
  // doesn't suddenly find itself fetching assets from a different build.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // Take over already-open tabs so they start using this SW immediately.
      // First-install case: no controller existed, so this just attaches.
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  // The auth flow sets and reads cookies; never intercept it.
  if (url.pathname.startsWith('/auth')) return;

  // Hashed build assets + everything in /static (favicons, fonts, …).
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Locally-cached remote avatars. The origin already sets immutable headers;
  // the SW just stops the network from being touched at all on repeat visits.
  if (url.pathname.startsWith('/avatars/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (SWR_PATHS.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // SSR HTML, /api/save, /api/health, anything else: straight to network.
});

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((res) => {
      if (res.ok && isCacheable(res)) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('offline', { status: 503, statusText: 'offline' });
}

function isCacheable(res: Response): boolean {
  const cc = res.headers.get('Cache-Control') ?? '';
  if (/no-store|no-cache/i.test(cc)) return false;
  return true;
}

sw.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') sw.skipWaiting();
});

export {};
