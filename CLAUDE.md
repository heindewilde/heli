# Working on Heli

The phased build spec is gone — work from what the user says in conversation, not from a written plan doc.

## Execution

- Branch: `main` (user approved working directly on main, no PRs).
- Quality bar: `npm run check` is **0 errors, 0 warnings**. The a11y warnings were all cleared (`91df127`); don't reintroduce them. If you must, add a `// svelte-ignore <rule>` comment matching the existing convention.
- No test framework — `npm run check` is what we have. Verify UI changes by running the feature in a browser when possible.
- App must stay lean enough to self-host on a cheap (1 GB RAM) VPS. Treat any new dependency as a footprint decision, not just an API choice.

## App overview

Heli is a personal CRM. SvelteKit 2 (adapter-node, full SSR) + libSQL/SQLite + Drizzle ORM, FTS5 search, lean bundle (no charting/markdown/animation deps).

- **Cloud version**: single Fly region (`ams`), with Cloudflare in front for global edge cache + brotli + HTTP/3 + TLS-near-user. Patch version auto-bumped per deploy.
- **Self-host**: one-line installer at `heli.so/install` provisions Docker + Caddy + Let's Encrypt on a VPS. Caddy is auto-configured. See `SELFHOST.md` for the full guide including a Performance-tuning section.
- **Multi-region DB**: optional Turso replicas via `DATABASE_URL_EU/US/APAC`. Region routing keyed by `email_routing` table; `db(region)` returns the right libSQL client. Writes go to `PRIMARY_REGION`.

## Lightweightness rules

- **Default to no dependency.** A 50-line hand-rolled helper beats a 5 MB package. Check `npm install --omit=dev` size before merging a new `dependencies` entry.
- **Bundle-only deps go in `devDependencies`.** Anything tree-shaken into the build (e.g. `lucide-svelte`, Tailwind) does not belong in `dependencies` — leaving it there bloats production `node_modules` by the full source size.
- **HTML parsing is `node-html-parser`** (`src/lib/server/og.ts`). Don't reintroduce `jsdom`, `cheerio`, or `parse5` — we deliberately removed an ~18 MB transitive chain. Note: `node-html-parser` does not support `[rel~="x"]`; iterate `link[rel]` manually (see `pickLink` in `og.ts`).
- **SQLite memory is tunable via `SQLITE_CACHE_MB` / `SQLITE_MMAP_MB`** env vars (defaults 16 MB cache, 64 MB mmap). Don't hardcode pragma values — keep the env path so small-server deploys can shrink further.

## HTTP, caching, headers

- **`src/lib/server/cache.ts` is the canonical place** for response shaping. Use it instead of `json()` or raw `Response` for authed GETs:
  - `jsonWithEtag(request, data)` — for **every** GET endpoint that returns per-user JSON. Sets `ETag` + `Cache-Control: private, max-age=0, must-revalidate` and short-circuits to a 304 on matching `If-None-Match`. The 5 list endpoints + the cursor-paginated `/api/{people,companies}/list` all use it.
  - `setPrivate(res)` / `setPrivateRevalidate(res)` — when you construct the Response yourself and need explicit Cache-Control + `Vary: Cookie`.
  - `maybeCompress(res, accept-encoding)` — streaming gzip via `node:zlib`. Already wired in `hooks.server.ts`; don't call again.
- **`hooks.server.ts` auto-applies** `Cache-Control: private, no-store` + `Vary: Cookie` to any response without its own header. Routes that opt in to caching (avatars, landing, install, list APIs via `jsonWithEtag`) set their own. Don't fight the default.
- **`adapter-node` has `precompress: true`** in `svelte.config.js` — static assets are gzipped/brotli'd at build time. Dynamic responses are gzipped on the fly via `maybeCompress` (Cloudflare or Caddy in front then re-encodes to brotli for browsers).
- **Server-Timing** header is emitted in `dev` only: `total;dur=<ms>`. Visible in DevTools Network → Timing.

## Client-side patterns

- **Optimistic list cache: `src/lib/client/listCache.svelte.ts`**. Used by `/people` and `/companies`. Pattern:
  ```ts
  const cache = createListCache<Row>(data.items);
  $effect(() => { cache.hydrate(data.items); /* sync nextCursor too if used */ });
  const rows = $derived(cache.items);

  async function patch(id, body, optimistic?) {
    const rollback = cache.patch(id, optimistic ?? body);
    try {
      const res = await fetch(...);
      if (!res.ok) { rollback(); toast.danger(); }
    } catch { rollback(); toast.danger(); }
  }
  ```
  **DO NOT** call `invalidateAll()` after a simple PATCH on a list-cache-backed page — it negates the optimism by triggering a full server reload. Trust the local cache. Only invalidate when the mutation crosses something the cache doesn't own (tag counts, totals, statuses-list).
- **Service worker: `src/service-worker.ts`** auto-registers in prod builds. Cache-first for hashed build + static + `/avatars/*`; stale-while-revalidate for GET `/api/{people,companies,projects,interactions,search}`. Skips `no-store`/`no-cache` responses. New builds wait for explicit reload via the `UpdateBanner` (no `skipWaiting` on install — keeps mid-flight pages on one version).
- **Reusable actions: `src/lib/actions.ts`** — `use:autofocus` (don't use the HTML `autofocus` attribute; svelte-check flags it), `use:onIntersect={callback}` (IntersectionObserver wrapper, fires on enter with `rootMargin: '200px'`).
- **Streaming load**: `+layout.server.ts` returns the `listReminders` promise *unawaited* so HTML ships before the reminders query resolves. The popover wraps it in `{#await data.reminders}…{:then}…{/await}`. Use the same pattern for layout-level data that doesn't gate first paint.

## List pages: pagination & shared row shapes

- **SSR `LIMIT` is 50** on `/people`, `/companies`, `/projects`, `/interactions`. Don't bump it back up — bigger payloads regress global perf.
- **Cursor pagination** lives only on `/people` and `/companies`, and **only for the default unfiltered `sort=recent` view**. Filtered/searched/non-default-sort views show the first 50 only. Adding cursor support across arbitrary filter+sort combinations is a separate, larger piece of work — revisit if it shows up as a pain point.
  - `+page.server.ts` peeks `LIMIT 51` when applicable, slices to 50, emits `nextCursor`.
  - `GET /api/{people,companies}/list?cursor=...` powers Load More, returning the rich joined shape via `PERSON_ROW_COLS` / `COMPANY_ROW_COLS` from `src/lib/server/{people,companies}-rows.ts`. These shared modules are the single source of truth for the row shape and JOINs — both the page-server query and the cursor endpoint import from them.
  - Cursor encoding helpers in `src/lib/server/cursor.ts` (`createdAt_id` format).
  - `use:onIntersect={loadMore}` on the Load More container auto-fires when scrolled near the bottom. Manual click works too.
- The page's `+page.svelte` keeps a local `nextCursor` state; the hydrate `$effect` resyncs it from `data.nextCursor` on filter/sort change.

## Search

- **CommandPalette debounce: 40ms**. Stale-response guard (`q.trim() !== v`) prevents out-of-order renders.
- **Server-side LRU** in `src/lib/server/search.ts` wraps `searchAll()`. Cap 256, TTL 30s, keyed by `region:userId:perKind:rawQ`. Per-process so multi-region deployments get one cache per region for free. 30s TTL means a freshly-added entity can take up to 30s to appear in cached hits — acceptable; add explicit invalidation if it bites.

## Implementation gotchas to remember

- **FTS5 triggers**: when adding/altering FTS5 virtual tables, mirror `ai/ad/au` triggers for every column listed in the `CREATE VIRTUAL TABLE` block. On migration, seed `INSERT INTO *_fts(rowid, …) SELECT …` so pre-existing rows are searchable.
- **SSRF guard with redirects**: `fetch` follows redirects automatically; `assertPublicUrl` on the input URL is not enough. Use `redirect: 'manual'` and re-check `assertPublicUrl` on each `Location` header before re-fetching. Cap to a few hops. See `fetchWithRedirectGuard` in `src/lib/server/og.ts`.
- **Bookmarklet** posts to `/api/save` with `credentials:'include'` — only works when invoked from same-origin (i.e. while on a Heli tab) or when CORS is configured. Same-origin limitation is documented in Settings; do not loosen CORS for it.
- **Bootstrap escape hatch**: `DISABLE_REGISTRATION=1` must still allow registration when `users` table is empty.
- **Janitor**: at startup, clear `source='parsing'` rows where `updatedAt < now-10min` — covers crashed enrichments mid-fetch.
- **Sanitize on write**, not on read. Stored notes are already-sanitized HTML.
- **`PRIMARY_REGION`** defaults to `'local'` on single-host setups and only falls back to `'EU'` when a `DATABASE_URL_EU/US/APAC` is configured. Don't reintroduce a hardcoded `'EU'` default.
- **CSP heads-up**: `hooks.server.ts` sets `script-src 'self' 'unsafe-inline'` which does **not** explicitly allow `scripts.simpleanalyticscdn.com`. Either SvelteKit's `kit.csp.directives` merges the host in via the auto-mode, or analytics is silently blocked. Worth confirming in browser devtools next time the analytics script is in scope.

## Naming

- Brand strings live in `src/lib/branding.ts` only (`APP_NAME`, `APP_DOMAIN`, `APP_TAGLINE`, `BRAND_ACCENT`). Never hardcode "Heli" elsewhere — keep a single rename point.

## graphify

A knowledge graph of this repo lives at `graphify-out/` (gitignored). It's the
fastest map for cross-module questions. Treat it as a *helpful* index, not a
source of truth — the code is.

Rules (apply only when `graphify-out/` exists; skip silently if missing):
- For broad codebase questions ("how does X relate to Y", "what touches Z"), skim `graphify-out/GRAPH_REPORT.md` or use `graphify query`/`path`/`explain` before falling back to grep. For a single known file, just Read it.
- If `graphify-out/.needs_update` exists, `*.md` docs have changed since the last full rebuild — run `/graphify --update` (LLM cost) before relying on doc-to-code rationale edges.
- The post-commit hook auto-rebuilds code edges (AST-only, free). `graphify update .` re-extracts everything including docs and **costs LLM tokens**.
