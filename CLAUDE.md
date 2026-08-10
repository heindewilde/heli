# Working on Heli

The phased build spec is gone — work from what the user says in conversation, not from a written plan doc.

## Execution

- Branch: `main` (user approved working directly on main, no PRs).
- Quality bar: `npm run check` is **0 errors, 0 warnings**. The a11y warnings were all cleared (`91df127`); don't reintroduce them. If you must, add a `// svelte-ignore <rule>` comment matching the existing convention.
- **Tests are Vitest, server-side only** (`npm test`, and `npm run check` runs
  them). Config is `vitest.config.ts` — deliberately separate from
  `vite.config.ts` so `vite build` never reads it. Node environment, no
  sveltekit plugin, `pool: 'forks'` because `db.ts` computes `PRIMARY_REGION`
  at module load.
  - `tests/helpers/testDb.ts` gives each test file a temp **file** database.
    Never `:memory:` — `buildBundle` gates `applyPragmas` on
    `url.startsWith('file:')`, so in-memory silently skips
    `PRAGMA foreign_keys = ON` and FK tests pass for the wrong reason. It also
    clears `DATABASE_URL*` before the first import of `db.ts` and refuses a
    path inside the repo.
  - A `Scope` is branded and cannot be faked; `tests/helpers/fixtures.ts` calls
    the real `register()` and mints scopes through `requireScope`.
  - There is still no component/browser testing. Verify UI changes by running
    the feature in a browser.
- App must stay lean enough to self-host on a cheap (1 GB RAM) VPS. Treat any new dependency as a footprint decision, not just an API choice.

## App overview

Heli is a personal CRM. SvelteKit 2 (adapter-node, full SSR) + libSQL/SQLite + Drizzle ORM, FTS5 search, lean bundle (no charting/markdown/animation deps).

- **Cloud version**: single Fly region (`ams`), with Cloudflare in front for global edge cache + brotli + HTTP/3 + TLS-near-user. Patch version auto-bumped per deploy.
- **Self-host**: one-line installer at `heli.so/install` provisions Docker + Caddy + Let's Encrypt on a VPS. Caddy is auto-configured. See `SELFHOST.md` for the full guide including a Performance-tuning section. Self-hosters run `ghcr.io/heindewilde/heli:latest`; a Watchtower sidecar auto-updates every 6 hours.
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

## Tenancy — read this before touching any query

Heli is multi-user. A **workspace** owns every CRM record; `user_id` on those
tables is *created-by attribution only and must never be used as a filter*.

- **Every server query helper takes a `Scope`** (`src/lib/server/scope.ts`), not
  `(userId, region)`. Mint one with `requireScope(locals)` — that's the only
  sanctioned way, the type is branded. `requireRole(s, 'owner', 'admin')` gates
  admin-only actions. Filter on `s.workspaceId`; write `s.userId` only into
  `user_id`/`by_user_id` columns.
- **`npm run check` now runs `scripts/check-tenancy.ts`**, which fails on any
  `user_id =` filter or `eq(x.userId, …)` outside an explicit allowlist. If you
  add a genuinely user-scoped query (sessions, memberships, account settings),
  add the file to `ALLOW_FILES` with a reason — don't weaken the regex.
- **Raw SQL is the blind spot.** The `Scope` arity change makes most mistakes a
  compile error, but template-literal SQL type-checks fine while filtering the
  wrong column. That's what the lint is for. Four files shipped this bug once
  already by aliasing `const userId = locals.user.id` first.
- **Reminders are personal**, tasks are shared. Reminder reads filter on
  `(workspace_id, user_id)`; the index is `idx_reminders_ws_user_at`. Don't
  "simplify" that to workspace-only.
- **A workspace is pinned to one region** — its rows live in one regional DB, so
  every member must resolve to that region. Cross-region invites are rejected at
  creation time; `scripts/migrate-user.mjs` is the documented escape hatch.
- **`workspaces.id === users.id` for the owner's first workspace.** The backfill
  depends on that bijection (it's what made re-keying five unique indexes on live
  data collision-free) and `createWorkspace` keeps it true for new signups. Don't
  write `WHERE workspace_id = user_id` anywhere — it's an artifact, not a rule.
- **Never delete a user row that still owns workspace content.** `user_id` keeps
  its `ON DELETE CASCADE`, so `removeMember`/`deleteAccount` call
  `reassignAuthorship()` first. Repointing that FK properly would need SQLite
  table rebuilds, and a rebuild reassigns rowids — silently invalidating all six
  FTS5 external-content indexes in a way `rebuildFts()`'s count check cannot
  detect.
- **The search LRU is keyed by workspace**, with a per-workspace epoch bumped on
  write (`bumpSearchEpoch`). Keying it by user while queries filter by workspace
  would leak straight out of cache.
- **Workspace switching rotates the session id** and posts `PURGE_API` to the
  service worker. `Vary: Cookie` alone can't tell two workspaces apart behind one
  cookie.
- **`migrate.ts` re-runs every boot, so anything expensive must be gated on
  `schema_meta`.** Two gates exist. `workspace_backfill_v1` guards the one-shot
  data backfill. `oneshot_ddl_fingerprint` guards the per-statement DDL loops
  (`ALTERS`, `WORKSPACE_UNIQUES`, `DROPPED_INDEXES`) — ~60 sequential round trips
  that cost ~6s per database per boot against remote libSQL, times three
  databases in the cloud.
  - That gate keys on a **sha1 of the statement lists**, not a version number:
    add or edit a statement and it re-runs once, automatically. Don't replace it
    with a manual version — that's a bump someone will forget.
  - It is recorded only when every statement applied (`applyTolerant` returns a
    boolean). A unique index that legitimately fails on duplicate data must keep
    retrying on later boots, not be marked done.
  - The `execMany` blocks (`DDL`, `WORKSPACE_INDEXES`, `FTS`) stay ungated: one
    round trip each, all `IF NOT EXISTS`, so they still repair a database someone
    has dropped a table out of.
- **`PERSONAL_TABLES` (currently just `reminders`) must never be reassigned.**
  Those rows carry `workspace_id` but their `user_id` is a real owner, not
  attribution, so `reassignAuthorship` deletes them instead of handing them to
  the workspace owner. Reassigning shipped once and quietly moved a departing
  member's private reminders into the owner's sidebar.
- **Nothing cascades off `workspaces`.** `workspace_id` was added by `ALTER` as
  a plain `REFERENCES workspaces(id)`, and `owner_user_id` deliberately doesn't
  cascade either. So deleting a workspace means deleting its tenant rows first,
  in that order — `deleteAccount` does, batched. A bare `DELETE FROM workspaces`
  fails with a FK error the moment the workspace holds one row.
- **Members can do CRM work; owners/admins do workspace-wide damage.** Creating,
  editing and deleting records is open. `requireRole` guards the wide-blast-
  radius calls: `POST /api/import`, `DELETE /api/statuses`,
  `DELETE /api/tags/[id]`, pipeline delete, and stage delete/reorder. The
  `/api/export` guard is friction, not containment — `/api/people` and
  `/api/search` return much the same data.
- **`npm run check` now enforces three tenancy rules**, all in
  `scripts/check-tenancy.ts`: no stray `user_id` filters (`ALLOW_FILES` to opt
  out); raw SQL touching a `TENANT_TABLES` table must mention `workspace_id`
  (`// tenancy-ok: <reason>` to opt out); and every mutating handler under
  `src/routes/api` must call `requireRole` or be listed in `MEMBER_ALLOWED` with
  a reason. Adding an endpoint without a role decision fails the build.
- **Invite expiry is reclaimed lazily.** `uq_workspace_invites_pending` can't
  express expiry — a partial index has no "now" — so `createInvite` stamps
  `revoked_at` on a stale row before inserting, and the boot janitor sweeps the
  rest. Don't assume the index frees the slot.

## Implementation gotchas to remember

- **FTS5 triggers**: when adding/altering FTS5 virtual tables, mirror `ai/ad/au` triggers for every column listed in the `CREATE VIRTUAL TABLE` block. On migration, seed `INSERT INTO *_fts(rowid, …) SELECT …` so pre-existing rows are searchable.
- **SSRF guard with redirects**: `fetch` follows redirects automatically; `assertPublicUrl` on the input URL is not enough. Use `redirect: 'manual'` and re-check `assertPublicUrl` on each `Location` header before re-fetching. Cap to a few hops. The implementation is the private `fetchOnce` in `src/lib/server/og.ts` — it is **not** shared yet, so anything else making outbound requests has to reimplement it. Extract it before adding a second caller.
- **IPv6 in the SSRF guard**: `u.hostname` keeps the brackets on a literal (`[::1]`) and `isIP()` rejects that form, so strip them before the check. And `new URL()` re-serializes `[::ffff:127.0.0.1]` to `::ffff:7f00:1` — never match private ranges against the dotted spelling. `isPrivateIPv6` works on the eight expanded groups and covers IPv4-mapped, IPv4-compatible, NAT64 and 6to4, all of which carry a real IPv4 address. Covered by `src/lib/server/url.test.ts`.
- **Bookmarklet** posts to `/api/save` with `credentials:'include'` — only works when invoked from same-origin (i.e. while on a Heli tab) or when CORS is configured. Same-origin limitation is documented in Settings; do not loosen CORS for it.
- **Registration has two flags, and the docs must name both.** `ENABLE_REGISTRATION=1` reopens public sign-ups, which self-host closes automatically once one account exists; `DISABLE_REGISTRATION=1` is the hard kill switch and wins. Bootstrap escape hatch: registration is always allowed while `users` is empty, and a live invite admits its addressee even when public signup is closed.
- **Janitor**: at startup, clear `source='parsing'` rows where `updatedAt < now-10min` — covers crashed enrichments mid-fetch, and retire expired invites. It runs once per regional DB at boot (last step of `migrateOne`), not on a timer, so it is hygiene rather than a correctness mechanism.
- **Sanitize on write**, not on read. Stored notes are already-sanitized HTML.
- **`PRIMARY_REGION`** defaults to `'local'` on single-host setups and only falls back to `'EU'` when a `DATABASE_URL_EU/US/APAC` is configured. Don't reintroduce a hardcoded `'EU'` default.
- **CSP heads-up**: `hooks.server.ts` sets `script-src 'self' 'unsafe-inline'` which does **not** explicitly allow `scripts.simpleanalyticscdn.com`. Either SvelteKit's `kit.csp.directives` merges the host in via the auto-mode, or analytics is silently blocked. Worth confirming in browser devtools next time the analytics script is in scope.

## Versioning

Every push to `main` triggers two workflows:

1. **`fly-deploy.yml`** — auto-bumps the patch tag (`v0.2.5` → `v0.2.6`), pushes it to git, deploys to Fly. The tag name is passed as `VERSION` build arg → cloud shows `Version: v0.2.6`.
2. **`docker.yml`** — triggered by the tag push (not the branch push). Builds a multi-arch image, tags it `:latest` + `:stable` + the semver tags, passes the tag name as `VERSION` → self-hosted shows the same `Version: v0.2.6`.

**Rules to never break:**
- `docker.yml` must only trigger on `tags: ['v*']` (and `workflow_dispatch`), never on `push.branches`. If you add a branch trigger back, `:latest` will get a SHA as its version instead of a clean number.
- `package.json` version must stay in sync with the latest `v*` tag. Bump it whenever you'd bump the tag.
- Both `:latest` and `:stable` are pushed on every tag build — don't remove either.
- `VERSION` in the Dockerfile is set at build time via `--build-arg`. The value flows through to `PUBLIC_HELI_VERSION` (read in `src/lib/version.ts`). Don't add a runtime env var for this — it's intentionally baked in at build time.

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
