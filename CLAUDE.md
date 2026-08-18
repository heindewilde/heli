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
  - **The `_fly-ownership` TXT records are load-bearing — do not delete them.**
    Cloudflare proxies `heli.so` (orange cloud), so Let's Encrypt's HTTP-01
    challenge never reaches Fly and certificate *renewal* fails. Fly falls back
    to a DNS ownership check, which needs:

    | Type | Name                  | Content        |
    |------|-----------------------|----------------|
    | TXT  | `_fly-ownership`      | `app-zkrnq63`  |
    | TXT  | `_fly-ownership.www`  | `app-zkrnq63`  |

    Without them the initial certificate still issues (it was created before the
    proxy was switched on), renewal silently fails for ~90 days, and the site
    goes down the moment the old certificate expires. That is exactly what
    happened on 2026-08-12.
  - **Symptom to recognise: Cloudflare `525`.** It means CF reached the origin
    but TLS failed — almost always a missing origin certificate, not an app
    fault. Diagnose without guessing:
    ```
    curl -sS -o /dev/null -w '%{http_code}\n' https://heli.so/        # 525
    curl -sS -o /dev/null -w '%{http_code}\n' https://heli-app.fly.dev/  # 200 → app is fine
    openssl s_client -connect 66.241.125.54:443 -servername heli.so </dev/null
    #   "no peer certificate available" → Fly has no cert for that hostname
    fly certs list -a heli-app          # "Not verified" / "Issuing..."
    fly certs check heli.so -a heli-app # forces revalidation once DNS is right
    ```
    A 5xx on `heli.so` while `heli-app.fly.dev` is healthy is *never* a reason
    to redeploy — the deploy will succeed and change nothing.
- **Self-host**: one-line installer at `heli.so/install` provisions Docker + Caddy + Let's Encrypt on a VPS. Caddy is auto-configured. See `SELFHOST.md` for the full guide including a Performance-tuning section. Self-hosters run `ghcr.io/heindewilde/heli:latest`; a Watchtower sidecar auto-updates every 6 hours.
- **Multi-region DB**: optional Turso replicas via `DATABASE_URL_EU/US/APAC`. Region routing keyed by `email_routing` table; `db(region)` returns the right libSQL client. Writes go to `PRIMARY_REGION`.

## Lightweightness rules

- **Default to no dependency.** A 50-line hand-rolled helper beats a 5 MB package. Check `npm install --omit=dev` size before merging a new `dependencies` entry.
- **`dependencies` has exactly two entries, and that is deliberate.**
  `@libsql/client` (native bindings) and `bcryptjs` are the only packages the
  running server resolves from `node_modules`. Everything else the server uses —
  `drizzle-orm`, `sanitize-html`, `node-html-parser`, `@paralleldrive/cuid2` —
  sits in `devDependencies` **on purpose**, because `adapter-node` externalises
  exactly what is in `dependencies` and bundles the rest. Bundling them took the
  production closure from 100 packages / 43.7 MB to 23 / 11.9 MB.
  - **Moving one of them back to `dependencies` un-bundles it** and re-inflates
    the image. If you add a server dependency, the default is
    `devDependencies`; it only belongs in `dependencies` if it has native
    bindings or does runtime `require()` that rollup cannot see.
  - **`scripts/check-externals.ts` is what makes this safe.** It runs as part of
    `npm run build` and **fails** if the built server imports anything that is
    neither a `node:` builtin nor a current `dependencies` entry. Without it,
    a package that quietly stayed external would resolve fine in dev and throw
    `ERR_MODULE_NOT_FOUND` on the first production request.
- **Bundle-only deps go in `devDependencies`.** Anything tree-shaken into the build (e.g. `lucide-svelte`, Tailwind) does not belong in `dependencies` — leaving it there bloats production `node_modules` by the full source size.
- **`scripts/check-budget.ts` prints the footprint on every `npm run check`** —
  app-shell JS and CSS, the heaviest route, and the production dependency
  closure, each against a committed `BASELINE`. It is **report-only** by design:
  a threshold that fails the build gets raised by whoever is in a hurry, whereas
  moving `BASELINE` is a diff a reviewer sees. Update it in the same commit that
  moves the numbers.
- **No `@tailwindcss/typography`.** It was 18.5 KB of the 64 KB root stylesheet —
  shipped to every page, including the landing page — for five call sites.
  `src/lib/ui/richText.css` replaces it: a plain CSS module imported by the three
  components that render sanitized HTML, so Vite splits it into their chunks. Its
  selector list mirrors `ALLOWED_TAGS` in `src/lib/richText.ts`; anything else
  would be styling markup `sanitize()` cannot emit. `/privacy` and `/terms` carry
  `class="prose"` but style it themselves in a scoped `<style>` — note they need
  an explicit `list-style: disc`, because Tailwind's preflight resets it and the
  plugin used to put it back.
- **Nothing that ships to the browser may import `@paralleldrive/cuid2`.** It
  pulls `@noble/hashes`, which rollup emits as a 25 KB raw / 11 KB gzipped chunk
  of SHA-512. `src/lib/toasts.svelte.ts` imported it for a toast's list key and,
  because `Toaster` is mounted unconditionally in the root layout, that made a
  cryptographic hash ~29% of the app shell. It uses a counter now — and *not*
  `crypto.randomUUID()`, which is undefined outside a secure context (the
  plain-HTTP LAN self-host that `src/lib/client/clipboard.ts` also exists for).
- **HTML parsing is `node-html-parser`** (`src/lib/server/og.ts`). Don't reintroduce `jsdom`, `cheerio`, or `parse5` — we deliberately removed an ~18 MB transitive chain. Note: `node-html-parser` does not support `[rel~="x"]`; iterate `link[rel]` manually (see `pickLink` in `og.ts`).
- **SQLite memory is tunable via `SQLITE_CACHE_MB` / `SQLITE_MMAP_MB`** env vars (defaults 16 MB cache, 64 MB mmap). Don't hardcode pragma values — keep the env path so small-server deploys can shrink further.
- **The rich-text editor is `squire-rte`, and that is a deliberate exception** to
  "default to no dependency". 18 KB gzipped, zero dependencies, MIT, and it is
  Fastmail's own email composer. Quill is 43 KB plus four dependencies including
  `lodash-es`; TipTap is 90 KB+ across packages. It is a `devDependency`
  (bundle-only) and `RichText.svelte` imports it dynamically, so it lands in its
  own lazily-fetched chunk rather than the initial bundle. See the Rich text
  section below before touching it.

## Code splitting: a hazard worth knowing about

Three attempts to lazy-load a component in this app produced a **production-only
hydration crash that blanked every page**: lucide's legacy-mode `Icon` calling
Svelte's `init()` with a null component context, thrown from the root layout's
first `<Tooltip>`. It reproduces only in a built app — `npm run dev`,
`svelte-check` and the whole Vitest suite stay green — so nothing but loading
the built app in a browser catches it.

The three that tripped it, all now reverted:
- `{#await import(...)}` for `OutreachDialog` at both its call sites, which left
  it reachable *only* dynamically, so Rollup gave it a chunk of its own — and
  that chunk transitively contains another dynamic import, because `RichText`
  fetches `squire-rte` on mount.
- Having `MessageComposer` shared by *both* `OutreachDialog` and
  `/outreach/[id]/run`, which creates the same shape: a shared chunk that leads
  to `squire-rte`. The component still exists and `OutreachDialog` uses it —
  it is the second consumer that broke things, so the run screen keeps its own
  copy of the composer markup and the duplication there is deliberate, not an
  oversight.
- Two `+error.svelte` files rewritten as shims containing no runes, which Svelte
  therefore compiles in **legacy mode**. A legacy-mode route node puts
  SvelteKit's root on the Svelte 4 compatibility path. `<svelte:options
  runes={true} />` did not rescue it.

Practical rules until this is understood properly:
- **Do not introduce a new dynamic import that can reach `RichText`.** Squire's
  own lazy import is fine and must stay; a *second* dynamic boundary above it is
  what breaks.
- **Every route node must use at least one rune**, so none of them compile in
  legacy mode.
- **Load the built app in a browser before merging anything that moves a chunk
  boundary.** The type check and the tests cannot see this class of failure.
- Lazy-loading the command palette also silently cost a feature: page-scoped
  "This page" commands are registered in each page's `onMount`, and a palette
  that mounts only when opened never sees them.

## HTTP, caching, headers

- **`src/lib/server/cache.ts` is the canonical place** for response shaping. Use it instead of `json()` or raw `Response` for authed GETs:
  - `jsonWithEtag(request, data)` — for **every** GET endpoint that returns per-user JSON. Sets `ETag` + `Cache-Control: private, max-age=0, must-revalidate` and short-circuits to a 304 on matching `If-None-Match`. The 5 list endpoints + the cursor-paginated `/api/{people,companies}/list` all use it.
  - `setPrivate(res)` / `setPrivateRevalidate(res)` — when you construct the Response yourself and need explicit Cache-Control + `Vary: Cookie`.
  - `maybeCompress(res, accept-encoding)` — streaming gzip via `node:zlib`. Already wired in `hooks.server.ts`; don't call again.
- **`hooks.server.ts` auto-applies** `Cache-Control: private, no-store` + `Vary: Cookie` to any response without its own header — except authenticated CRM navigations (`/people`, `/companies`, `/projects`, `/interactions`, `/collections`, `/pipelines`), which get `private, max-age=0, must-revalidate` so the service worker may keep a copy. Routes that opt in to caching (avatars, landing, install, list APIs via `jsonWithEtag`) set their own. Don't fight the default.
- **`adapter-node` has `precompress: true`** in `svelte.config.js` — static assets are gzipped/brotli'd at build time. Dynamic responses are gzipped on the fly via `maybeCompress` (Cloudflare or Caddy in front then re-encodes to brotli for browsers).
- **Server-Timing** is emitted in dev, and in production for workspace owners: `db;desc="N queries";dur=…, app;dur=…, total;dur=…`. Visible in DevTools Network → Timing. See the Performance section below.

## UI primitives (`src/lib/ui/`)

Every overlay in the app goes through these. `scripts/check-overlays.ts` fails
the build on a hand-rolled `fixed inset-0`, a bare `role="dialog"`, or a numeric
z-index outside `src/lib/ui/` — add the file to `ALLOW` with a reason if it
genuinely owns its own stacking.

- **`Popover.svelte`** — anchored panels: menus, pickers, cell popovers. Uses
  `popover="manual"`, never `"auto"`: auto light-dismiss closes the whole
  popover stack on one press, which breaks the status cell's create-a-status
  sub-view and any menu inside a dialog.
  - The trigger is a snippet receiving `attrs` (the ARIA wiring plus a click
    handler that calls `stopPropagation` — list rows are wrapped in `<a href>`,
    so without it every cell popover navigates).
  - The role prop is `panelRole`, not `role`, so `role="dialog"` at a call site
    still means "hand-rolled overlay" to the lint.
  - Panels are `position: fixed` at coordinates from `position.ts`. That is what
    escapes the `overflow-hidden` list containers; the top layer is a bonus.
- **`Combobox.svelte`** — type-to-filter, arrow, Enter-to-create. `variant="panel"`
  inside a Popover, `variant="field"` for the chip pickers. Selects on
  `mousedown`, not `click`, so the press beats the blur.
- **`Dialog.svelte`** — modal surfaces. The backdrop has **no** click handler;
  dismissal comes from `layerStack`. Don't add one back — that is what forced
  the two a11y workarounds this replaced.
- **`Select.svelte`** — the dropdown. A real listbox on `Popover`, **not** a
  native `<select>`: `appearance-none` strips the platform chevron but nothing
  can style the open option list, so every dropdown used to open into an OS
  menu that ignored the theme. Data-driven (`options`, not `<option>`
  children); `name` renders a hidden input so form-action pages still post.
  - **Touch keeps the native control.** A transparent `<select>` sits over the
    trigger, given `pointer-events` only under `@media (pointer: coarse)`. The
    branch is CSS, not JS — detecting the pointer at mount would be a hydration
    mismatch on every dropdown in the app. It is `aria-hidden`/`tabindex="-1"`:
    a pointer target, not a second control.
  - **Focus is the keyboard cursor**, not an `activeIndex`. Options are real
    buttons, and the keydown handler has to live on the element that has focus
    — a handler on a wrapper never fires, because `trapFocus` has already
    focused past it.
  - **Initial focus polls for layout.** The panel mounts in `{#if open}` and
    `showPopover()` runs in one of Popover's effects; `focus()` on an element
    with no boxes is a silent no-op. This is also why Popover's own `autoFocus`
    misses here. Single-shot attempts (one rAF, two, the `toggle` event) are
    each sensitive to that ordering — the bounded poll is not.
  - **Arrows on a closed trigger open the list; they never step the value.**
    Several of these write on change, and one is a project's billing type,
    where a change clears the money column that type no longer owns. Stepping
    on a stray arrow key silently wiped an hourly rate once already.
  - `Combobox` is still the right answer when the list needs *searching*.
- **`SegmentedControl.svelte`** — mutually exclusive views. Renders links when
  segments carry `href`, so a view stays middle-clickable and shareable.
- **`StatTile.svelte`** — one headline number. `tabular-nums` without asking,
  because a row of these is read as a column of digits.
- **`Editable.svelte`** — click-to-edit a value, optimistic with rollback.
- **`RichText.svelte`** — the rich-text surface, wrapping `squire-rte`. Used by
  `NotesEditor`, so it is behind person notes and every company / project /
  collection / pipeline description. Four things about it are load-bearing, and
  three of them fail *silently*:
  - **Construct with `blockTag: 'P'`.** Squire's default is `DIV`, which is not
    on the sanitize allowlist — and sanitize-html discards a disallowed tag
    while keeping its text, so every paragraph break would vanish on save with
    nothing to show for it. `sanitize.test.ts` pins the collapse.
  - **Squire's canonical output is `<b>`/`<i>`** — it rewrites STRONG to B and
    EM to I in its own cleanup. `sanitize.ts` maps them back with
    `transformTags`, which sanitize-html runs *before* the allowlist check, so
    neither tag needs adding to `ALLOWED_TAGS`. Delete that mapping and every
    bold and italic is deleted on save.
  - **Import it dynamically inside `onMount`.** `squire-rte` touches `document`
    and `navigator` at module scope; a static import breaks SSR on all five
    detail pages. It is also what keeps it out of the initial bundle.
  - **The allowlist lives in `src/lib/richText.ts`**, not in `sanitize.ts`, so
    the editor's paste filter (`src/lib/ui/pasteFilter.ts`) and the server
    sanitizer cannot drift. Squire's default paste keeps `<table>`, `<font>`
    and `<span style>`; without the mirror you watch a pasted table render and
    then lose it on save. The filter accepts `PASTE_TAGS` — the allowlist *plus*
    `b`/`i`, since the server rewrites those rather than dropping them. Security
    is still entirely server-side; the filter is a WYSIWYG guarantee.
  - Values written before the editor existed are plain text whose line breaks
    live in `\n`. `richText.ts` decides: no block markup means legacy, so
    convert on the way into the editor and keep `whitespace-pre-wrap` on the
    read view. There is no backfill — rows normalize on first edit.
- **Descriptions are `{@html}`, so they need `sanitize()`, not
  `sanitizePlainText()`.** `collections.ts` and `pipelines.ts` used the latter,
  which only strips control characters — a member could store
  `<img src=x onerror=…>` in a collection description and run it in every
  colleague's session. Fixed; the same invariant already held for
  `people.notes`, `companies.description` and `projects.description`. If you add
  another column that `NotesEditor` renders, it goes through `sanitize()`.
- **`layerStack.ts`** — one stack, one pair of window listeners. Escape closes
  only the top layer; a pointer press walks down until it hits a layer
  containing the target. Never add a per-component Escape handler; it will fight
  this. (`src/lib/dismiss.svelte.ts` was deleted for exactly that reason.)
- **`scrollLock.ts`** — refcounted. Never touch `document.body.style.overflow`
  directly.
- **One popover per instance.** `Popover` owns a bindable `open`; a parent that
  tracks `openFor = <id>` across N rows cannot bind to it. Extract a component
  (see `PipelineStageChip`, `StageMoverButton`, `StageColorPicker`).

## Performance: what is actually slow

`Server-Timing` reports `db;desc="N queries"`, `app` and `total`, in dev always
and in production for workspace owners. **Measure before optimising** — the
numbers decide between "fewer queries" and "more caching", and they are not the
same work.

Measured on a production build against a local SQLite file, server render is
2–5 ms. There is nothing to win there. The cloud runs against **remote libSQL**,
where every query is a network round trip — so the metric that matters is the
query *count*, and the lever is fewer round trips.

- **Never `invalidateAll()` to display something you already have.** A create
  returns its row in list shape (`fetchPersonRow` / `fetchCompanyRow`, built on
  the same `*_ROW_COLS` the list query uses) and the page calls `cache.insert`.
  Creating a person went from 11 queries across two requests to 3 in one.
  `tests/create-returns-row.test.ts` pins that response shape — it is invisible
  to the type checker, because the client receives `unknown` off the wire.
- Genuine exceptions remain: tag counts, totals and the statuses list are not
  owned by any local cache, so those paths still reload.
- **Detail pages stream.** Only the header is awaited; interactions, tags,
  tasks, projects, collections and pipelines are returned as unawaited promises
  and wrapped in `{#await}`. Verified: on `/people/[id]` the name lands at byte
  ~3k and the first deferred resolution at ~41k.
- **No client-side entity cache, deliberately.** `preload-data="hover"` already
  fetches the full page data before the click, so a module-scope entity map
  would add a third tenancy-invalidation surface (after `Vary: Cookie` and the
  service worker's `PURGE_API`) for a benefit that is already delivered. The
  mobile card layouts opt into `"tap"` instead, since hover never fires on
  touch.

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
- **Service worker: `src/service-worker.ts`** auto-registers in prod builds. Cache-first for hashed build + static + `/avatars/*`; stale-while-revalidate for GET `/api/{people,companies,projects,interactions,search}`; **network-first with a 12-entry LRU fallback for SSR navigations** to `/people|companies|projects|interactions|collections|pipelines`. Skips `no-store`/`no-cache` responses. New builds wait for explicit reload via the `UpdateBanner` (no `skipWaiting` on install — keeps mid-flight pages on one version).
  - Storing rendered CRM pages is a decision made **server-side**: `hooks.server.ts`
    marks exactly those routes `private, max-age=0, must-revalidate` instead of
    the `no-store` default. `/settings`, `/admin` and `/` stay `no-store`.
    Caching a `no-store` response in the worker would be storing it anyway while
    telling the browser not to — worse than deciding on purpose.
  - `PURGE_API` therefore deletes the **whole** navigation cache as well as the
    `/api/*` entries. Both hold tenant data and neither survives a sign-out or a
    workspace switch.
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

## Public API (`/api/v1`)

Documented in `API.md`. Everything under `/api/*` **outside** `v1` is the UI's
private surface — no stability promise, no scope checks — and bearer tokens are
rejected there on purpose. Letting one in would quietly make every internal
endpoint public.

- **Token format `heli_<region>_<43 base64url>`**, SHA-256 hashed. Not bcrypt:
  32 CSPRNG bytes have nothing to slow an attacker down over, and bcrypt at
  auth.ts's cost factor would add ~80 ms to *every* API request.
  - Parse the region with the anchored regex in `tokens.ts`, never
    `split('_')` — base64url's alphabet **includes** `_`, so splitting rejected
    roughly three in four valid tokens. Tests caught it; don't reintroduce it.
- **`api_tokens` is in `TENANT_TABLES` *and* `PERSONAL_TABLES`.** A token
  authenticates as its owner, so `reassignAuthorship` must delete it, never hand
  it to the workspace owner.
  - **`devices` is in *neither*, and that is the whole difference.** A personal
    access token is workspace-scoped; a paired phone is user-scoped and has to
    follow its owner across every workspace they belong to, so the table has no
    `workspace_id` column at all and the acting workspace arrives per request in
    `X-Heli-Workspace`. Removing a member therefore does **not** unpair their
    phone — the membership row disappears and the per-request lookup fails for
    that workspace only. `deleteAccount` cleans up through the `user_id`
    cascade. Full reasoning in `MOBILE.md`; don't "fix" the asymmetry.
  - **No bearer credential can manage credentials.** `denyBearer` in `api-v1.ts`
    rejects both kinds on `/api/v1/tokens*`, `/api/v1/pairing*` and
    `/api/v1/devices` — a stolen phone is exactly the case where the web must be
    the only thing that can revoke it. `/api/v1/devices/self` is the one
    exception and takes no id parameter, so a device can only ever act on
    itself.
- **Role is read from the membership row at validation time**, exactly as for a
  session. A token can never outrank its owner, and a demotion takes effect
  without touching their tokens. Scopes only ever *narrow* — `requireApiScope`
  after `requireRole`, never instead of it. `write` implies `capture`.
- **`capture` also grants `read` on exactly three endpoints**, named as a union
  type in `requireApiScope`'s optional `surface` parameter: `me`, `lookup`,
  `tags`. The extension performs all three before it can capture anything, so a
  `capture` token that could not would be narrower than its own purpose — the
  documented setup produced a token that 403'd at the options page. The union
  *is* the allowlist: widening it to `/people` or `/search` is a compile error at
  the call site, not something a reviewer has to catch. Pass a surface only on
  those three handlers.
- **Tokens cannot manage tokens.** `/api/v1/tokens*` is cookie-session only, so
  a leaked token cannot mint its own replacement.
- **Validated tokens are cached in-process for 30 s** (LRU 512, same shape as
  the search cache). `revokeToken` evicts its own entry immediately — without
  that, Revoke would appear not to work for half a minute, which is exactly when
  the user is looking at it.
- **CORS never sends `Access-Control-Allow-Credentials`.** That is the
  load-bearing property: even a mistake in the `EXTENSION_ORIGINS` check cannot
  ride a session cookie. It is also why this is not a loosening of the
  bookmarklet's same-origin rule — that path is cookie-authenticated, this one
  cannot be.
  - **`OFFICIAL_EXTENSION_ORIGINS` in `api-v1.ts` is the built-in allowlist and
    `EXTENSION_ORIGINS` *adds* to it.** Env-only meant every self-hoster had to
    configure CORS before the extension worked at all, and the failure mode is a
    bare `TypeError: Failed to fetch` — all a browser ever tells a page about a
    blocked request. The constant is empty until the Web Store assigns an id;
    filling it in is the one line to change at launch. The options page prints
    `chrome-extension://<runtime.id>` so an unpacked build is self-service.
- **Every `/api/v1` response goes through `reshapeApiError`** in
  `hooks.server.ts`, so a thrown `error()` still matches the documented
  `{ error: { code, message } }` envelope. Return `apiOk`/`apiError` from
  handlers; don't hand-roll a `json()` shape.

## Search

- **CommandPalette debounce: 40ms**. Stale-response guard (`q.trim() !== v`) prevents out-of-order renders.
- **The palette runs commands as well as search.** Entities come from the
  server (FTS5 + the LRU); *commands* are matched client-side by
  `src/lib/commands/fuzzy.ts`. Don't move entity search to the client — it would
  mean shipping the workspace to the browser to do worse than SQLite does.
- **One keyboard dispatcher: `src/lib/commands/registry.svelte.ts`.** Register
  commands with `registerCommands([...])` in `onMount` and return the cleanup;
  `when` gates a binding by context, `hidden` keeps it out of the palette while
  still listing it in the shortcut sheet. Shortcuts are chords (`mod+k`, `?`) or
  sequences (`g p`, `n i`).
  - Never add another `window.addEventListener('keydown')`. `bindKeys` is gone
    precisely because it bailed on any modifier — which is why ⌘K needed its own
    listener — and because every page added a second one.
  - `ShortcutHelp` is *generated* from the registry. The old hand-kept list had
    drifted (four scope prefixes documented, six supported).
  - **Palette recents live in `localStorage` and are per-workspace.** They are
    cleared alongside `PURGE_API` on workspace switch and sign-out; a stale href
    from another tenant is both a 404 and a leak of a record's name.
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
- **SSRF guard with redirects**: `fetch` follows redirects automatically; `assertPublicUrl` on the input URL is not enough. Use `redirect: 'manual'` and re-check `assertPublicUrl` on each `Location` header before re-fetching. Cap to a few hops. The one implementation is `fetchGuarded` in `src/lib/server/fetchGuard.ts`, and **every outbound caller goes through it** — `og.ts`, `calendar.ts` and `imageCache.ts`. `imageCache` reimplemented the whole loop line for line for a while, which meant two guards to audit and two places for a fix to reach only one of. Don't write a third; add an option instead.
  - Read bodies with `readCapped` (text, truncates) or `readCappedBytes` (binary, **rejects**). The difference is deliberate: half an `.ics` is a calendar missing some events, half a PNG is a corrupt file that would be hashed and cached under that hash forever.
  - Use `withTimeout()` rather than a hand-rolled `AbortController`; it is exported from the same module.
- **IPv6 in the SSRF guard**: `u.hostname` keeps the brackets on a literal (`[::1]`) and `isIP()` rejects that form, so strip them before the check. And `new URL()` re-serializes `[::ffff:127.0.0.1]` to `::ffff:7f00:1` — never match private ranges against the dotted spelling. `isPrivateIPv6` works on the eight expanded groups and covers IPv4-mapped, IPv4-compatible, NAT64 and 6to4, all of which carry a real IPv4 address. Covered by `src/lib/server/url.test.ts`.
- **Bookmarklet** posts to `/api/save` with `credentials:'include'` — only works when invoked from same-origin (i.e. while on a Heli tab) or when CORS is configured. Same-origin limitation is documented in Settings; do not loosen CORS for it.
- **Registration has two flags, and the docs must name both.** `ENABLE_REGISTRATION=1` reopens public sign-ups, which self-host closes automatically once one account exists; `DISABLE_REGISTRATION=1` is the hard kill switch and wins. Bootstrap escape hatch: registration is always allowed while `users` is empty, and a live invite admits its addressee even when public signup is closed.
- **Janitor**: at startup, clear `source='parsing'` rows where `updatedAt < now-10min` — covers crashed enrichments mid-fetch, and retire expired invites. It runs once per regional DB at boot (last step of `migrateOne`), not on a timer, so it is hygiene rather than a correctness mechanism.
- **Sanitize on write**, not on read. Stored notes are already-sanitized HTML.
  - The sanitize lives **inside** `savePerson`/`saveCompany`, not at the call
    sites. Their manual-with-url branch used to skip it while the no-url branch
    and the enrichment path both applied it, so one `POST /api/v1/people` with a
    url stored raw markup straight into the column `NotesEditor` renders with
    `{@html}`. Company `description` goes the same way: it comes from a page's
    `og:description`, i.e. markup controlled by whoever owns that page.
- **`PRIMARY_REGION`** defaults to `'local'` on single-host setups and only falls back to `'EU'` when a `DATABASE_URL_EU/US/APAC` is configured. Don't reintroduce a hardcoded `'EU'` default.
- **CSP heads-up**: `hooks.server.ts` sets `script-src 'self' 'unsafe-inline'` which does **not** explicitly allow `scripts.simpleanalyticscdn.com`. Either SvelteKit's `kit.csp.directives` merges the host in via the auto-mode, or analytics is silently blocked. Worth confirming in browser devtools next time the analytics script is in scope.

## Calendars and the scheduler

`.ics` subscription, not OAuth. Every calendar app already exposes a secret feed
URL, which avoids a Google Cloud project per self-hoster plus a verification
review, and works with providers Google has never heard of. The cost is that the
**URL is the credential**.

- **`calendar_feeds` is in `TENANT_TABLES` *and* `PERSONAL_TABLES`.** Handing a
  departing member's feed URL to the workspace owner would hand over read access
  to their calendar.
- **Never return the raw URL.** `redactFeed` strips `url` and `self_emails` and
  returns host plus a 6-char hash. Do *not* "helpfully" show a path slice —
  harmless for Google (whose last segment is literally `basic.ics`), a leak for
  any provider that puts the token last.
- **Identity is `sha1(UID + NUL + RECURRENCE-ID)`**, stored in
  `interactions.external_id` with `external_source = 'ics'`. It deliberately
  excludes the feed id, so two colleagues subscribed to the same shared calendar
  produce one interaction rather than two.
  - `uq_interactions_ws_external` is **non-partial**. SQLite treats NULLs as
    distinct, so manually-created interactions never collide, and a partial
    index would force a matching `targetWhere` at every call site.
- **`updated_at === created_at` means "no human has touched this".** It gates
  both the update and the delete paths: a re-sync never overwrites someone's
  edit, and a cancelled meeting someone has annotated is retitled rather than
  deleted.
- **`syncFeed` reads and writes in batches, and that constrains it.** It used to
  run one SELECT per event plus one or two writes — ~6,000 round trips for a full
  2,000-event feed, times `MAX_FEEDS_PER_TICK`, inside a 60-second interval.
  Existence is now one chunked `inArray` (`matchInteractions`, same `MATCH_CHUNK`
  as `matchPeople`) and the writes go through `d.batch()` in chunks of 200.
  - **Queue writes in dependency order.** A batch is one transaction executed in
    sequence, so an `interaction_people` row has to be pushed after the
    interaction it references.
  - **Events are deduped by `externalId`, last one wins.** Two VEVENTs sharing a
    UID and RECURRENCE-ID used to resolve by accident — the first inserted and
    the second found that fresh row and updated it. Reading everything up front
    removes the accident: both would insert and collide on
    `uq_interactions_ws_external`.
  - The attendee lookup is a `Map` built once. It was a
    `flatMap(...).find(...)` *inside* the per-email loop, which on `matchMode:
    'all'` rebuilt every participant of every event once per new address.
- **RRULE is not expanded.** Recurring events are skipped and *counted*, and the
  count is shown in Settings. Correct expansion (EXDATE, BYSETPOS, UNTIL, COUNT)
  is 500+ lines, and a weekly 1:1 producing 52 interactions a year is noise. If
  the counter says otherwise, add a bounded expander then.
- **No tz database.** `TZID` offsets come from `Intl.DateTimeFormat`, computed
  per instant (the same zone has different offsets in January and July). An
  unknown zone falls back to UTC and is reported on the feed.
- **Unfold before anything else.** Google folds at 75 octets, mid-token; a
  parser that reads folded lines produces truncated UIDs — broken identity keys
  rather than visible errors.
- **Sniff the body for `BEGIN:VCALENDAR`.** A login page served as
  `text/calendar` would otherwise parse to zero events and look like an empty
  calendar.

**The scheduler** (`src/lib/server/scheduler.ts`) is one 60s interval started
from the `ready` IIFE in `hooks.server.ts`, jittered on first run so a rolling
deploy doesn't thunder.

- **The lease lives in `schema_meta`**, as `<processId>:<expiry>`, taken with a
  single conditional UPDATE and confirmed by `rowsAffected === 1`. No new table
  for one row.
- **One lease per regional database.** Each region's feeds live in that region's
  database, so each needs its own winner; every process attempts every region's
  lease. Correct at one machine in `ams`, and still correct at N.
- Escape hatch: `SCHEDULER_DISABLED=1`.
- `snapshotIfStale` and token/session expiry sweeps could ride on this later.
  The seam is free; don't take it in the same change as something else.

## Contact import (Google Contacts, LinkedIn CSV)

Two sources, **one staged shape and one commit path**. `src/lib/server/contactImport.ts`
owns `MappedPerson`, the pending-import map and `ImportSource`; the source-specific
part is only the mapping into `MappedPerson`. `POST /api/import` commits either.
The staging primitives used to live in `google.ts` and are re-exported from there.

- **`source` belongs to the import, not the person.** The commit hardcoded
  `'google_contacts'`, which became a lie the moment a second source shared the
  path. It is a field on the pending record now.
- **The commit writes `url`, `domain` and `handle`.** This is what makes an
  imported connection and a later browser capture *one* person: the extension
  resolves identity through `/api/v1/lookup`, which matches the unique
  `(workspace_id, url)`. Dropping the URL meant importing 800 connections and
  then capturing one produced a duplicate. `tests/import-linkedin.test.ts` pins it.
- **The commit bumps the search epoch.** Several hundred inserts is exactly the
  case that cache exists for.

### Triage: `/settings/import`

Nobody wants all 3,400 of their connections. The staged list is reviewed on its
own route before it is committed — filter by search, has-email, connected-since
and company, then pick.

- **The staging map is keyed by `userId`, not by the staging token.** Keyed by
  token, every upload minted a fresh key while the cookie was overwritten, so the
  previous entry became unreachable — nothing could call `getPendingImport` on
  it, its TTL was never read, and it lived until the process died. One retried
  3,400-row upload stranded ~1.4 MB; an 8 MB CSV strands ~22 MB, and `LIMITS.api`
  allows 300 requests a minute. One slot per user is what the UX already offers,
  so a re-upload now replaces its predecessor. `storePendingImport` also sweeps
  expired entries on write and rejects anything over `MAX_IMPORT_ROWS` (10,000) —
  the rows are held in memory, so the count is a memory budget, not a product
  limit. `tests/import-staging.test.ts` pins replace, sweep and cap.
- **The commit inserts in chunks of 100, not one row at a time.** A row per round
  trip meant ~100 seconds inside one handler for a 3,400-row import. A failed
  chunk retries row by row, so the `errors` count still counts contacts.
- **The commit takes indices, never rows.** `POST /api/import` accepts
  `{ include: number[] }` into the staged list, so the server goes on inserting
  only data it parsed itself; the worst a bad body can do is import fewer people.
  An absent body still means "all of it", which is what a direct API caller and
  the pre-review flow both expect.
  - An empty selection is a `400` raised **before** `deletePendingImport`. A
    mis-click must not cost someone the upload they have been triaging.
- **The rows come from the page load, not a `GET` endpoint.** Same bytes, one
  fewer round trip against an in-process map — and the map is the reason: stage,
  review and commit already have to reach the same machine, so filtering happens
  entirely in the browser rather than per keystroke over the wire. Only the five
  rendered fields are sent; `url`, `phone`, `location` and `notes` are committed
  but never shown, and across a few thousand rows they are most of the payload.
- **`connectedOn` is parsed, `notes` is not.** LinkedIn's "Connected On" is
  written to `notes` as its original string *and* parsed to an epoch for the
  date filter — two purposes, two representations. Parsed as UTC explicitly:
  `Date.parse` on a bare date reads local time, which moves a January connection
  into the previous year west of Greenwich, and year is the granularity offered.
  An unparseable date is `null` and drops out of the filter rather than being
  guessed at.
- **Bulk actions act on the filtered set, not the rendered rows.** The list
  renders at most 200 with an explicit "showing 200 of N" line — a cap that is
  stated beats a virtual-list dependency, and "select all matching" that quietly
  meant "the ones on screen" is the bug this screen would ship with.

### Why the LinkedIn CSV, and not an API

There is no API for other people's LinkedIn profiles. Sales Navigator's platform
is closed to new partners; every other LinkedIn product returns only the
authenticated member's own profile. The scraping vendors are not a safe
substitute — Proxycurl, the best-known "URL in, JSON out" API, was sued by
LinkedIn/Microsoft in January 2025 and shut down that July. In both that case and
hiQ, the fatal pattern was **fake accounts plus a central resold index of scraped
data**, which is worth knowing precisely because the extension does neither: it
reads a page the user already opened, in their own session, into their own CRM.
The member's own export is the only source that is official, complete for
first-degree connections, and cannot rot.

- **The file has a preamble.** A "Notes:" paragraph and a blank line sit above the
  header, and the line count has changed before — so `findHeader` *searches* for
  the header row and maps **columns by name**, never by position.
- **`parseCsv` in `csvParse.ts` is the reader half** of `csv.ts`, hand-rolled for
  the same footprint reason. It strips the UTF-8 BOM `csv.ts` writes, or a blank
  first header silently fails to match.
- **A blank email is the normal case.** The column is populated only for
  connections who opted in, and it is off by default. Identity here is the profile
  URL, not the email.
- **The URL goes through `cleanUrl`** at parse time, so it is byte-identical to
  what a capture from the browser produces.

## Browser extension (`extension/`)

A separate build artifact: its own `package.json`, its own `node_modules`,
esbuild rather than Vite, and **not** an npm workspace. A workspace would make
the app's `npm ci` install its dependencies and carry them into the Docker
builder layer.

Three guards keep it out of the app, and all three matter:
- `extension` is in `.dockerignore` — the Dockerfile does `COPY . .`.
- `exclude: ["extension"]` in the root `tsconfig.json`.
- `svelte-check` runs off `.svelte-kit/tsconfig.json`, which only includes
  `src/` and `tests/`, so it never sees it anyway.

The cost of that isolation is that **`npm run check` cannot type-check the
extension** — it would need `extension/node_modules`, which is the thing the
guards exist to keep out. `esbuild` strips types without checking them, so for a
while nothing checked them at all. `.github/workflows/ci.yml` runs
`npm run typecheck` (plain `tsc --noEmit`) as a separate job; keep it there.

**`mobile/` is the same arrangement, one size up — see `MOBILE.md`.** Same three
guards, same separate CI job, same reason. Three rules from it belong here
because they constrain code in `src/`:

- **`MOBILE_ENABLED` gates discovery of the app, and nothing else.** The server
  half shipped to `main` ahead of any store release, so the Devices section in
  Settings — the only place a pairing code is handed out — is behind
  `mobileEnabledFor` in `src/lib/server/devices.ts`. The endpoints and `/pair`
  stay live on purpose, so a dev build can pair against production. **It is not
  a security boundary**; every device endpoint authenticates on its own. Unset
  means nobody, `1` means everyone, anything else is an email allowlist. Read
  per request, so launch is a secret change rather than a deploy.

- **Modules listed in `mobile/tsconfig.json`'s `include` must stay
  dependency-free.** Metro blocks the repo root's `node_modules`, so a shared
  module that grows an import — a package, or a `$lib`/`$app`/`$env` alias — does
  not resolve there. `scripts/check-shared.ts` runs in `npm run check` and fails
  next to the web code being edited, because otherwise the break surfaces only in
  the mobile CI job, long after a change that looks fine in the web app.
- **`TYPE_META`'s tone strings in `interactions.ts` deliberately duplicate
  `TYPE_TONE_TOKEN` in `interactionMeta.ts`.** Tailwind v4 extracts classes by
  scanning source text, so deriving `text-[var(${token})]` from the map would
  type-check, pass the tests, and ship every icon with no colour.

- **Tokens, not cookies.** The session cookie is `SameSite=Lax`, so a fetch from
  `chrome-extension://…` will never carry it. That is a browser guarantee, not
  an obstacle — the extension pastes a `capture`-scoped personal access token
  once, and the options page verifies it against `/api/v1/me` before storing.
- **`activeTab` + `scripting`, never `<all_urls>`.** The content script is
  injected when the popup opens. Chrome then describes the extension as running
  on click, which is the truth and is worth keeping.
- **Adapters degrade, they don't break.** Every field resolves through an
  ordered strategy list (JSON-LD → Open Graph → CSS selector); first non-empty
  wins, and every parsed field is editable in the popup before save. Site markup
  rots; an empty editable field is a fine outcome, a thrown parser is not.
  `localStorage.__heli_debug = 1` logs which strategy fired.
  - A field the adapters fill must be **rendered *and* sent**. `company` was
    parsed by two adapters, shown as an editable input, and then absent from the
    request body — invisible to the type checker (a missing key is not an error)
    and to the server (`unknown` off the wire). `captureBody` in
    `extension/src/capture-body.ts` is the single place the body is built, and
    `tests/extension-capture.test.ts` asserts every key it emits is one the
    endpoint reads. Add a popup field → add it there.
  - **`bio` is not `role`.** A job title and a self-description are different
    columns; the X and GitHub adapters both resolved `role` from the bio element,
    which stored "AI is cool i guess" as somebody's job title. `bio` becomes
    `people.notes`. GitHub and X profiles have no job title at all — `role` stays
    unset there.
  - **`avatarUrl`, `linkedinUrl` and `xUrl` are sent but not editable**, and
    that is the one deliberate exception to "every parsed field is editable".
    Nobody retypes an image URL, and a rotted selector there costs an avatar
    rather than a record. The avatar goes through `cacheRemoteImage` in
    `savePerson`, so a record never depends on a third-party hotlink.
  - **Enrichment now runs *alongside* a capture instead of being skipped**, with
    two guards. `enrichPerson`'s `preserve` set drops every field the extension
    already supplied, so an OG fetch cannot overwrite what was read from the
    rendered DOM; and `servesAuthwall()` skips the fetch entirely for
    `linkedin.com`, where the server gets a sign-up wall and anything it
    "extracts" is chrome. That is what makes it safe to fill the *blank* fields
    (favicon, socials, postal address) that a profile DOM doesn't carry.
  - **`meta()` reads `getAttribute('content')`, not `.content`.** Identical in a
    real DOM, and it is what lets the strategies run against `node-html-parser`
    so the tests can use real saved markup instead of a stub built to match the
    selectors.
  - **Fixtures are pre-hydration.** `tests/fixtures/*.html` is fetched HTML, so a
    selector aimed at client-rendered content looks dead in a test and may still
    work in the browser — and the reverse also happens: GitHub's repo name is
    `<strong itemprop=name><a>` in served HTML and `<div itemprop=name>` once
    hydrated, so only the attribute is portable. Verify against a live page —
    `extension/README.md` has the checklist.
  - **LinkedIn person pages have no metadata left.** Checked live: no `og:` tags,
    no JSON-LD, no `<h1>`, and every class is a per-build hash (`_20e55808 …`).
    What survives is **accessibility markup**, because LinkedIn has to keep that
    correct. All of it is in `linkedin.ts`:
    - `a[href*="/in/<slug>"] [aria-label]` → the name. The slug comes from the
      URL we are already on, so it cannot match someone else in the feed.
    - The *other* `<p>` in that same block → the headline, which serves as `role`.
      "The one that isn't the name", not "paragraph two" — reordering the block
      or adding a badge does not move it.
    - The headline's ` at ` tail → the employer. A heuristic, and still better
      than the `/company/` links in the top card, which on a live profile
      resolved to BlackRock, Carhartt and Ford — promoted content in the same
      container. A wrong company is worse than none.
    - `[aria-label="Profile photo"] img` → the avatar.
    - `document.title` as `"<Name> | LinkedIn"`, minus the `"(3) "` unread
      prefix, as the last-resort name.
    - **`location` is deliberately `null`.** It sits in an unlabelled `<p>` with
      no anchor, and counting paragraphs is the same shape of guess that put a
      follower count into a company's location. Blank and editable beats
      confidently wrong.
    Company/school pages are still on the old DOM and fully functional.
  - **There is no JSON to intercept on LinkedIn — don't build an observer.**
    Checked directly: a profile load makes *no* API calls (only `/preload/` and a
    telemetry POST), and the document is 1.2 MB of server-rendered markup
    carrying the data inline. It is a server-driven UI —
    `data-sdui-screen="com.linkedin.sdui.flagshipnav.profile.Profile"`,
    `data-sdui-component`, `componentkey` GUIDs. So patching `fetch` at
    `document_start` to capture Voyager payloads, which would otherwise be the
    obvious way to get structured data, finds nothing. The DOM is the only source.
  - **Positional selectors need match order, not `:nth-child`.** A live company
    page resolved "29M followers" as its location, because those summary items
    are not a flat run of siblings. `orgInfoItem(n)` indexes
    `querySelectorAll` and rejects follower/employee counts outright.
- **`cleanUrl` is imported from `src/lib/cleanUrl.ts`, never copied**, and
  `content.ts` actually calls it. For a while the import existed only in
  `extension/tsconfig.json` while the content script sent `location.href` raw;
  the docs claimed otherwise and a test now asserts the call site. Those rules
  decide whether two spellings of a LinkedIn URL are the same record, so the
  extension and the server must agree exactly —
  `tests/extension-adapters.test.ts` asserts they do. The server-only half
  (`assertPublicUrl`, which needs `node:dns`) stays in `src/lib/server/url.ts`.
- **The popup's palette is generated from `src/app.css`** by
  `extension/scripts/tokens.mjs` at build time, so it cannot drift from the app.
  Don't hand-copy colours into `popup.css` — that file is layout only.
- **`extension/dist/` is what you load unpacked**, and it is gitignored.
- **The manifest's version comes from `extension/package.json` at build time.**
  `scripts/build.mjs` writes it into the copy it emits, so the two files cannot
  drift — same reasoning as the icons and `tokens.css`. Bump `package.json` only.
  `npm run package` zips `dist/` into `heli-extension-<version>.zip` for a store
  upload, shelling out to `zip` rather than taking a dependency.

## Outreach

Message templates that render against a person, get copied, and are logged.
**Heli never sends.** That is the load-bearing constraint, not a stage: no SMTP,
no queue, no deliverability, no unsubscribe law, no per-workspace credentials —
and it works identically for LinkedIn, X and WhatsApp, none of which expose a
send API anyway. Don't "finish" it by adding sending.

- **The root layout uses `listTemplateSummaries`, never `listTemplates`.** It
  runs on every authenticated request in the app to populate the command palette
  and keeps only `id`, `name`, `platform`. The unprojected version fetched every
  `body` (capped at 20,000 chars, limit 200) across the wire to discard it —
  megabytes per navigation against remote libSQL. Mapping the columns off in JS
  is not the same thing; the projection has to happen in SQL. `countTemplates`
  exists for the same reason: `/outreach` used to run the whole list a second
  time to read `.length`.
- **Templates address a person, never a company.** You cannot DM a company. From
  a company you pick one of its people.
- **`user_id` on `outreach_templates` means two different things per row**:
  attribution on a shared template, real ownership on a private one. Hence
  `ROW_PERSONAL` in `migrate.ts` — a table → constant SQL predicate map naming
  the rows to *delete* on member removal, with the rest reassigned as usual. In
  `reassignAuthorship` the DELETE must run **before** the UPDATE; reversed, the
  private rows have already been reassigned and survive as the owner's.
- **Every template query lives in `src/lib/server/outreach.ts`**, which is in
  `ALLOW_FILES`. The visibility predicate is
  `workspace_id = ? AND (visibility = 'shared' OR user_id = ?)`, which trips
  check-tenancy Rule A, and Rule A has no per-line pragma. Inline that predicate
  in a route and you are adding files to the allowlist forever.
- **The platform decides the shape, not the author.** `platforms.ts` holds
  whether a subject exists, the character budget, the deep link, and which
  `INTERACTION_TYPES` value gets logged. There is no `linkedin_dm` interaction
  type and adding one would touch the type icons, the filters and `API.md` — the
  specificity is carried by `interactions.outreach_template_id` instead. A test
  asserts every platform maps to a real interaction type.
  - **Only email keeps markup.** Every other composer pastes plain text, so
    authoring rich text for them would show formatting that cannot survive.
- **Rendering happens in the browser, and that is forced.** The clipboard write
  must stay inside the user's click: Safari invalidates the gesture across an
  `await`, and its escape hatch (a `Promise<Blob>` in `ClipboardItem`) is what
  Firefox rejects. There is no portable async path, so `src/lib/outreach/render.ts`
  is dependency-free and shared, and the bulk run pre-renders the whole batch.
  - `navigator.clipboard` is **undefined**, not a rejected promise, outside a
    secure context — the docker-compose quickstart before Caddy, and any LAN
    self-host. `src/lib/client/clipboard.ts` falls back to `execCommand`, which
    can only carry one flavour, and the UI says so.
- **Character budgets count rendered plain text.** LinkedIn's 300 is 300
  characters of message; counting stored HTML, or counting before substitution,
  shows a number the platform disagrees with.
- **Unresolved variables get a warning strip, never highlight markup.** There is
  no `span`, `mark` or `class` on the sanitize allowlist, and decorating inside
  a contenteditable lets someone delete half a highlight node.
- **Copy and Mark as sent are two steps everywhere**, including the bulk run. A
  queue is exactly where a one-click shortcut logs messages nobody sent.
- **Mark-as-sent logs the edited body from the client**, not a re-render: the
  preview is editable, so what gets recorded has to be what was copied. A failed
  reminder does not fail the log.
- **`interactions.outreach_template_id` is `ON DELETE SET NULL`**, never CASCADE
  — deleting a template must not delete the record of what you wrote to someone.
- **There are no template statistics and none are planned.** That column exists
  only so provenance stays recoverable; one nullable column today beats a
  migration plus permanently missing history later.
- **A pipeline card links to the person's page** rather than opening a composer
  on the board, because the board query carries name/role/avatar and the
  composer needs email, LinkedIn URL and company name. `?outreach=<id>` opens it
  and is stripped immediately so a refresh doesn't reopen it.
- **Attaching templates to a stage is `requireRole`**, matching stage delete and
  reorder — it is board configuration the whole workspace sees. Writing a
  template stays open to members.

- **A template declares who it addresses: `outreach_templates.target`.** Added
  as `NOT NULL DEFAULT 'person'`, so SQLite backfilled every template written
  before it — "existing templates keep working" is a database fact rather than
  a coercion each read has to remember. The column decides three things: which
  variables `buildVariables` emits, which audience `resolveAudience` resolves,
  and which of `personId`/`companyId` `/api/outreach/sent` will accept.
  - **`OUTREACH_TARGETS` lives in `platforms.ts`, not `schema.ts`.** `render.ts`
    needs the type and is on the mobile shared list, where the only import that
    resolves is a relative one to another shared module. Importing drizzle
    there fails `check-shared.ts`.
  - **`Recipient` is a union whose person arm has `kind` *optional* and whose
    company arm has it *required*.** That asymmetry is what lets every existing
    call site keep passing a bare object and still narrow correctly. Don't
    "tidy" it by requiring `kind` on both.
  - **A company has no `first_name`, `last_name`, `full_name` or `role`, and
    `buildVariables` omits them deliberately.** Resolving `{{first_name}}` to
    the company's name would produce "Hi Acme Corp," with no warning; leaving it
    unresolved raises the warning strip, which is the correct outcome.
  - **`PERSON_VARIABLES` / `COMPANY_VARIABLES` stay *derived* from
    `buildVariables`**, so the editor's helper list cannot drift from what
    actually renders.
  - **`/api/outreach/sent` takes exactly one of `personId`/`companyId`, and it
    must match `template.target`.** `interactions.outreach_template_id` is the
    only provenance an outreach message leaves; a mismatch would make it lie.
    `createInteraction` already took `companyId`, and `REMINDER_KINDS` already
    carried `'company'` — only the endpoint was in the way.
  - **`OutreachDialog` serves both kinds; there is no `CompanyOutreachDialog`.**
    `MessageComposer` must keep exactly one consumer (see the code-splitting
    section). Widening the dialog's props is the only safe shape.
  - **`CompanyOutreachButton`'s lazy `import('./OutreachDialog.svelte')` is safe
    only because `/people/[id]` imports the same component statically**, which
    keeps it in a static chunk. Delete that static import, or add a third
    dynamic-only call site, and the dialog gets a chunk of its own that
    transitively reaches `squire-rte`.
  - **Stage templates return `target` but are never filtered by it in SQL.** A
    pipeline holds people *and* companies, so a stage may legitimately offer
    both; `PipelineItemCard` filters to its own item's kind.

## Collections

A collection is an ad-hoc grouping of people *and* companies. Its detail page is
an overview: a kind filter, a list/card density toggle, client-side search and
sort.

- **`getCollection` and `getCollectionDetail` share one implementation and must
  not be merged.** `CollectionDetail` is the response body of
  `GET /api/v1/collections/[id]` and `POST /[id]/items`, so anything added to
  `CollectionMember` ships to every API consumer forever. The page needs each
  person's company name and each member's tags; those live on
  `CollectionMemberDetail`, which the API never returns.
  `tests/collections-detail.test.ts` asserts the exact key set of both, because
  the body crosses the wire as `unknown` and no type checker can see the leak.
- **The tags ride in wave three, not in the page load.** `loadCollection` is
  three round trips — collection, items, then people ‖ companies ‖ person tags ‖
  company tags. Calling `getTagsForEntities` from `+page.server.ts` instead
  would make it four, because the tag queries need ids that only exist after
  wave two.
- **The company join is LEFT and its `workspace_id` predicate lives on the join
  condition.** An inner join silently drops every person with no company, which
  empties the page; the predicate is what makes the join tenant-safe on its own
  terms rather than by inheritance.
- **Never read `kind` in `collections/[id]/+page.server.ts`.** SvelteKit tracks
  search-param dependencies per key, so a load that touches only `just` is not
  re-run when `?kind=` changes — which is the whole reason the filter is
  instant. Reading `kind` there costs a server round trip per segment click and
  breaks nothing visible, so only `e2e/collection-detail.spec.ts` catches it: it
  types into the search box and asserts the text survives a segment click.
- **The list/cards preference is `localStorage`, read in `onMount` — never at
  init.** The server cannot know the stored value, so a first client render that
  picks a different branch than the SSR'd HTML is a hydration mismatch (the same
  hazard that keeps `Select.svelte` from detecting the pointer type at mount).
  SSR always renders `list`. `src/lib/client/viewPref.ts` says so in its
  docblock; it is under `$lib/client` and `check-overlays.ts` rule D will fail
  the build if a server file imports it.
- **Cards in the grid are uniform by reserving boxes, not by pinning a height.**
  A grid where a five-tag person is taller than an untagged company reads as two
  components rather than one collection. So `CollectionMemberCard` keeps the
  subtitle line's box when a member has no role or domain, keeps the tag row's
  box only when `reserveTags` says *something* in this collection is tagged, and
  caps the tags at three plus a `+N`. A hard `h-[…]` is the obvious alternative
  and leaves dead space under every card in the common untagged case.
- **Adding is one `Add` button over a `Popover`, not two open pickers.** The
  pickers used to sit inline above the members: a full row of empty comboboxes
  that made the page read as a form with a list under it. The panel follows the
  kind filter, so `?kind=people` offers no company picker.
- **The page is one column.** The old `<aside>` held a paragraph explaining what
  a collection is — chrome that cost the members a third of the width on every
  visit. The pipeline-sync card is a full-width banner under the header now,
  matching `pipelines/[id]`.
- **Its tag chips are inert `Badge` spans, not the `<a href="?tag=">` the list
  pages use.** The card root is already an anchor; a nested one is invalid HTML
  and would steal the click.
- **`{#each}` over members needs a compound key** — `` `${m.kind}:${m.id}` ``.
  People and companies share one list and their ids come from two tables.
- **`collection_items` has no position column.** The only ordering signal is
  `addedAt`, which the query returns DESC; bulk-added members share one
  millisecond, so their relative order is rowid. Drag-to-reorder would need a
  migration.

## Bulk selection and bulk actions

`/people` and `/companies` support multi-select. Column 1 is the checkbox and
the priority flag moved to a 24px column at the far right; both list pages
define `GRID` once and the header and rows share it.

- **One endpoint per kind — `POST /api/{people,companies}/bulk`** — carrying a
  discriminated action, rather than array variants on five existing endpoints.
  Every action is one to three statements using `inArray`, against remote
  libSQL where the round trips are the cost. `MAX_BULK_IDS = 200`.
- **Ids outside the workspace resolve to nothing rather than raising.** A
  selection goes stale between the tick and the click, and the response's
  `count` tells the truth. Every statement filters `workspace_id` first.
- **`requireRole` for the delete action lives in `src/lib/server/bulk.ts`, not
  in the route file.** `check-tenancy.ts` Rule C short-circuits on a
  `requireRole` anywhere in a handler *before* consulting `MEMBER_ALLOWED`, so
  putting it in the route would make the allowlist entry dead code and hide the
  decision. It is also what makes the gate testable, since the suite calls
  helpers rather than handlers.
- **The response is `{ count }` and deliberately carries no rows.** Returning
  200 rows in list shape means a second joined query costing more than the
  write, and the client already holds what it sent.
- **What happens after depends on whether the cache owns it**: priority and
  status use `cache.patchMany`; tags end in `invalidateAll()` because
  `data.itemTags`, `data.allTags` and the counts are server-load-owned; delete
  invalidates for the total pill.
- **`selection.prune`, not `clear`, on hydrate.** An action ending in
  `invalidateAll()` brings the same rows back, and clearing would make a second
  action impossible; a filter change shrinks the selection on its own.
- **The `Escape` command is guarded by `layerDepth() === 0`.** The command
  registry is a second window listener that does not know about `layerStack`,
  so without the guard one Escape would close the popover *and* throw away the
  selection under it. Never add a component-level Escape handler instead.
- **`ActionBar` lives in `src/lib/ui/`** so `check-overlays.ts` permits its
  z-index token. It is a toolbar, not a layer — it takes no focus and is not on
  `layerStack`.

## Bulk URL import

Paste anything containing links on `/people` or `/companies`, review at
`/import/urls`, commit. Members may do it; `LIMITS.urlImport` bounds it rather
than a role gate, the same trade `/api/save` makes for the bookmarklet.

- **`extractUrls` is deliberately lenient and deliberately not built on
  `parseCsv`.** Running the pattern over the whole blob extracts a CSV's URL
  column without guessing which column it is, and a second anchored pass
  promotes a bare host that occupies a whole field. The anchor is load-bearing:
  without it, "i.e." inside prose becomes a record.
- **`urlImport.ts` is a second staging map, not a widening of
  `contactImport.ts`.** One slot would mean a pasted list silently destroys a
  half-triaged 3,400-row CSV, and `MappedPerson` would become a union carrying
  a `kind` that is permanently `'person'` for both contact sources.
- **`MAX_URL_IMPORT_ROWS` is 500 — a *network* budget, not a memory one.** Each
  row costs one to two outbound fetches; that is why it is far below
  `MAX_IMPORT_ROWS`.
- **The commit chunk-inserts rather than calling `savePerson` per row** (500
  rows would be ~1,000 sequential round trips), so it must not re-derive the
  row shape: `derivePersonRow` / `deriveCompanyRow` are exported from the save
  modules and are the one definition. `url`, `domain` and `handle` decide
  whether a later capture deduplicates, so a drift there is a duplicate record.
  `tests/url-import.test.ts` pins that the two paths agree.
- **LinkedIn rows are created but never enqueued.** `servesAuthwall` means a
  fetch finds only sign-up chrome, so they keep `source='parsing'` until the
  boot janitor clears it. The review screen says so, because otherwise it looks
  broken.

## The enrichment queue

`src/lib/server/enrichQueue.ts` paces every background enrichment in the app.
`savePerson`/`saveCompany` call it instead of a bare `void enrichPerson(...)`,
so the extension, the bookmarklet, `/api/v1/people` and the bulk import are all
bounded by one change with no call-site branching.

- **Two lanes, urgent first.** Without them a 500-row drain sits in front of
  every ordinary save and a sidebar paste spins for minutes. Only the bulk
  commit passes `'bulk'`.
- **`ENRICH_CONCURRENCY` (default 4) is tunable** for the same reason
  `SQLITE_CACHE_MB` is — a 1 GB VPS is a supported target.
- **Deliberately not persisted.** A job lost to a restart leaves its row on
  `source='parsing'`, which the boot janitor already sweeps — a failure mode
  that is handled rather than a new one. A job table plus a retry policy for
  something whose worst outcome is a missing favicon is the opposite of the
  lightweightness rule.

## Planning: projects, allocations, availability, time

Four things sharing one spine: a project says what the work is, an allocation
says whose weeks it takes, `/availability` reads those weeks back, and `/time`
records what actually happened.

- **Hours are integer minutes everywhere**, the way money is cents. `7.5 hours`
  is `450`, and 450 always adds up. `$lib/duration` is the only place that
  converts, and `parseDuration` accepts every shape people type (`1:30`,
  `1.5h`, `90m`, `90`) because a timesheet correction is a number you know.
- **`$lib/weeks` is Monday-anchored and UTC on both sides of the wire.** There
  is no workspace timezone setting anywhere in the app (see `ics.ts`) and this
  is not the feature that should introduce one. Partial weeks are **pro-rated
  by days covered** — without that, an engagement starting on a Wednesday reads
  as a full week of commitment. The week key is real ISO-8601, because at a
  year boundary a naive "day of year / 7" gives one week two different labels.
- **`project_allocations` has two user columns and the difference is
  load-bearing.** `user_id` is created-by attribution and is reassigned
  normally; `assignee_user_id` is whose week is booked and is **deleted** when
  that member leaves — see `ASSIGNMENT_COLUMNS` in `migrate.ts`. Reassigning it
  would book the workspace owner for work that walked out of the door.
- **`time_entries.ended_at IS NULL` *is* the running timer.** No separate table,
  no flag; that is what lets you start on a laptop and stop on a phone.
  `uq_time_entries_running` (partial unique, in `WORKSPACE_UNIQUES`) enforces
  one per person, and `startTimer` leans on it rather than reading first —
  a read-then-write races with your own second tab.
- **There is no duration column.** Both timestamps are stored and duration is
  derived, so the two representations cannot drift.
- **The rate on a time entry is a snapshot**, resolved allocation → project when
  the entry is created or stopped. Re-deriving it at report time would mean
  raising a project's rate silently reprices work you already invoiced.
  `tests/time-entries.test.ts` pins that.
- **`time_entries.project_id` is `ON DELETE SET NULL`**, never CASCADE. Deleting
  a project must not erase the record of hours billed against it — same
  reasoning as `interactions.outreach_template_id`.
- **`ROW_PERSONAL` splits time by row**: a *running* entry is live UI state
  belonging to someone who has gone and is deleted; *finished* entries are
  billing history and are reassigned.
- **Heli generates no invoices.** `GET /api/export?kind=time` is the seam, and
  it carries the stored rate rather than the project's current one. `invoicedAt`
  exists as a nullable column so a locking pass is cheap later; nothing writes
  it.
- **Availability is computed from commitments only** — not tracked time, not
  calendar load. `capacityWindow` is two queries whatever the window size (one
  for members, one for overlapping allocations) and buckets in JS; a per-week or
  per-member query is what would make a 52-week board slow against remote
  libSQL.
- **`/time` is deliberately absent from `NAV_CACHEABLE`** while being in
  `PROTECTED_PATTERNS`: a page carrying a live timer must never be painted from
  a stored copy. `/api/time` is likewise not in the service worker's SWR list;
  `/availability` and `/api/capacity` are.
- **`allocations.ts` and `time.ts` are in `ALLOW_FILES`.** Both filter on a user
  column that is a real owner rather than attribution. Every statement in them
  still filters `workspace_id` first.
- **The billing cross-field rule is `BILLING_MONEY_FIELD`**, not an if/else
  chain. A project owns exactly one money column; with four billing types the
  chain had to be right in three separate places. Note the consequence: changing
  a billing type *clears* the columns that type no longer owns, so anything that
  can fire a `billingType` write accidentally is a data-loss path.
- **`project_allocations.day_mask` is a Mon..Sun bitmask**, NULL meaning
  unspecified. Where it is set the weekly hours divide across those days (16h/wk
  on Tue+Thu is 8h each) and clipping is by *pattern* day; where it is NULL every
  consumer must behave exactly as it did before patterns existed, which
  `tests/weeks.test.ts` pins explicitly. `0` normalises to NULL on write so
  there is one representation of "no pattern".
- **`/availability` has three views**, each fetching only its own data: the
  capacity grid, `weekDetail` (one week by day), and `projectTimeline` (bars per
  project, spanning the union of that project's allocations — deliberately not
  `projects.start_date`, since a project can be dated long before anyone is
  booked).
- **Report rounding is applied per entry, never to the total.** Three six-minute
  calls are three billable units. The raw total is kept alongside the rounded one
  and the delta is shown — rounding you cannot see is rounding you cannot check.
- **Colour is project identity, via `$lib/projectColor`.** It hashes an id onto
  the existing `--stage-*` palette rather than introducing a chart palette;
  `gray` is excluded so a real project can never look like a neutral row.
- **The print stylesheet in `app.css` is what makes "Export PDF" free.** It
  forces the light palette, drops nav and `.no-print` chrome, repeats table
  headers across pages and preserves backgrounds. Screens opt in with
  `.no-print` / `.print-only`; there is no PDF dependency and there should not
  be one.

## Versioning

Every push to `main` triggers two workflows:

1. **`fly-deploy.yml`** — auto-bumps the patch tag (`v0.2.5` → `v0.2.6`), pushes it to git, deploys to Fly. The tag name is passed as `VERSION` build arg → cloud shows `Version: v0.2.6`.
2. **`docker.yml`** — triggered by the tag push (not the branch push). Builds a multi-arch image, tags it `:latest` + `:stable` + the semver tags, passes the tag name as `VERSION` → self-hosted shows the same `Version: v0.2.6`.

**Rules to never break:**
- `docker.yml` must only trigger on `tags: ['v*']` (and `workflow_dispatch`), never on `push.branches`. If you add a branch trigger back, `:latest` will get a SHA as its version instead of a clean number.
- `package.json` version must stay in sync with the latest `v*` tag. Bump it whenever you'd bump the tag.
- Both `:latest` and `:stable` are pushed on every tag build — don't remove either.
- `VERSION` in the Dockerfile is set at build time via `--build-arg`. The value flows through to `PUBLIC_HELI_VERSION` (read in `src/lib/version.ts`). Don't add a runtime env var for this — it's intentionally baked in at build time.
- **`mobile/package.json` and `extension/package.json` carry their own versions,
  deliberately unlinked from this one.** A web deploy happens on every push to
  `main`; a store submission must not. Mobile releases are tagged `mobile-v*`,
  which matches neither `fly-deploy.yml`'s `v[0-9]*.[0-9]*.[0-9]*` filter nor
  `docker.yml`'s `v*` — check that still holds before adding a tag trigger.

## Visual conventions

- **A list's grid template is defined once per page** (`GRID` / `ROW_GRID`) and
  used by both the header row and the data rows. They were two identical inline
  literals kept in sync by hand; a column added to one and not the other
  misaligns the whole table silently.
- **Reduced motion is handled globally** in `src/app.css` — one `@media` rule at
  the end of the cascade covering every transition and animation, including ones
  added later. Don't add per-component `prefers-reduced-motion` blocks; the five
  that existed covered five things out of ninety. It sets a near-zero duration
  rather than `animation: none`, because killing an animation mid-flight can
  strand an element on its first frame.
- **The focus ring is global** (`*:focus-visible` in app.css) and uses
  `--color-border-strong`, never the accent. When a container needs focus for a
  trap, focus a focusable *child* — a `tabindex="-1"` wrapper picks up the ring
  and draws a frame round the whole surface.
- **`Skeleton`** (`src/lib/ui/Skeleton.svelte`) is the placeholder for streamed
  sections; size it to match what replaces it so nothing jumps.

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

## Browser tests (`e2e/`)

Vitest here is server-side only and always has been — it calls helpers and
handlers, never a component. That gap let a real bug ship: a ticked row rendered
as unticked, because `preventDefault()` on a checkbox click makes the browser
restore `input.checked` after every handler has run. Six hundred passing tests
could not see it. Playwright covers that surface; `npm run test:e2e`, its own CI
job, never part of `npm run check`.

- **They run against `build/index.js`, never `vite dev`.** The hydration failure
  this file documents at length appears only in a built app, so testing dev
  would be testing the one configuration where it cannot happen.
- **`e2e/server.mjs` seeds a throwaway database and then boots.** Playwright
  starts `webServer` *before* any setup hook, so a `globalSetup` would run after
  the server had already tried to open a database that did not exist.
- **Auth is a cookie, minted by the app's own `register()`.** Driving the
  sign-in form would make every spec depend on the auth UI.
- **`visit()` waits for `html[data-hydrated]`**, set by the root layout's
  `onMount`. Every SvelteKit-level signal — `history.state`, the
  `__sveltekit_*` global — is in place *before* component hydration finishes, so
  gating on those still let clicks land on nothing.
- **`serviceWorkers: 'block'`.** It auto-registers in production builds and
  takes over navigations to the very routes these specs drive, so a page could
  be served from a cache an earlier assertion wrote. That was the whole of the
  flakiness, and it also cost a minute of wall clock per run.
- **Every spec fails on a console error.** The hydration crash throws once and
  leaves markup that still looks server-rendered, so an assertion on visible
  text can pass while the app is dead.
