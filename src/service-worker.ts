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

// A Set, because the lookup below runs on every single GET the page makes and
// `PRECACHE` is ~140 entries — a linear scan per request for a membership test.
const PRECACHE_SET = new Set(PRECACHE);

// API endpoints that we serve with stale-while-revalidate. They are private
// per-user data, so we only ever cache responses that came back with
// `Cache-Control: private, max-age=*, must-revalidate` (set in cache.ts).
const SWR_PATHS = /^\/api\/(?:people|companies|projects|interactions|search)(?:\/|\?|$)/;

// CRM pages whose SSR HTML we keep a copy of, so back-navigation paints
// instantly and a dropped connection still shows the last known state instead
// of the browser's error page. hooks.server.ts marks exactly these routes
// `private, max-age=0, must-revalidate` rather than `no-store` — the decision
// to store them is made there, on purpose, not smuggled in here.
// `outreach` is deliberately absent: a composer's contents are the most volatile
// thing in the app and the least useful to paint from a stale copy. Keep this in
// step with the route list in hooks.server.ts, which is what marks these
// cacheable in the first place — a path here that is `no-store` there would be
// stored anyway while telling the browser not to.
const NAV_PATHS = /^\/(?:people|companies|projects|interactions|collections|pipelines)(?:\/|$)/;

// Cap on stored pages. Each is a full SSR document at 100-300 KB, so this is a
// disk-footprint bound as much as a freshness one — 30 of them is several
// megabytes on the user's device for a back-navigation win that 12 delivers
// nearly all of. Oldest entries go first.
const NAV_CACHE_LIMIT = 12;
const NAV_CACHE = `${CACHE}-nav`;

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
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== NAV_CACHE).map((k) => caches.delete(k))
      );
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
  if (PRECACHE_SET.has(url.pathname)) {
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

  // SSR navigations for the CRM routes: network first, cache as a fallback.
  // Never cache-first — a stale CRM page shown in preference to a live one is
  // worse than a few hundred milliseconds of wait.
  if (req.mode === 'navigate' && NAV_PATHS.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else — /, /settings, /api/save, /api/health: straight to network.
});

async function networkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(NAV_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && isCacheable(res)) {
      cache.put(req, res.clone()).then(() => trimNavCache(cache)).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) {
      // Mark it, so the page can tell the user what they are looking at.
      const headers = new Headers(cached.headers);
      headers.set('X-Heli-Offline', '1');
      return new Response(cached.body, { status: 200, headers });
    }
    throw new Error('offline and not cached');
  }
}

async function trimNavCache(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  if (keys.length <= NAV_CACHE_LIMIT) return;
  // cache.keys() returns insertion order, so the head is the oldest.
  await Promise.all(keys.slice(0, keys.length - NAV_CACHE_LIMIT).map((k) => cache.delete(k)));
}

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
  // Drop every cached /api/* response. Sent on workspace switch and on sign-out.
  // `Vary: Cookie` protects us between different users, but a workspace switch
  // used to keep the same cookie — so the header alone can't tell workspace A's
  // cached people list from workspace B's. (The switch also rotates the session
  // id now; this is the belt to that pair of braces.)
  if (event.data === 'PURGE_API') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => SWR_PATHS.test(new URL(req.url).pathname))
            .map((req) => cache.delete(req))
        );
        // The navigation cache holds fully-rendered CRM pages, so it has to go
        // too. Dropping the whole cache is simpler than filtering it and there
        // is nothing in it worth keeping across a sign-out or a tenant switch.
        await caches.delete(NAV_CACHE);
      })()
    );
  }
});

export {};
