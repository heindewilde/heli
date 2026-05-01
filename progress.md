# Gusto build progress

This file is the handoff note. Read `GUSTO.md` (the spec) and `CLAUDE.md` (the working strategy) first, then this for current state.

## Where we are

**Phases 0–3 of `GUSTO.md` are done and on `origin/main`.** Phases 4–6 remain.

```
edcd9d4  Phase 0  bootstrap (SvelteKit + Tailwind v4 + Geist)
3534bcd  Phase 1  persistence & auth
dff2b4c  Phase 2  People & Companies — paste-a-link save + lists + detail
5063e49  Phase 3  Interactions
6d2cf40  fix      QA pass — Tailwind class, p-shortcut, whitespace-pre-wrap
e04d5b7  fix      stop importing $lib/server/saveInteraction from client code
```

Working tree is clean. Tracking `origin/main`. The `data/gusto.db` SQLite file holds dev test data; safe to delete to start fresh.

## How to run / pick up

```bash
npm install          # if node_modules missing
npm run dev          # vite dev on http://localhost:5173
npm run check        # svelte-check + tsx scripts/check-classify.ts
```

Dev login (already in `data/gusto.db`): `test@gusto.local` / `hunter2hunter`.

If the dev server starts throwing "An impossible situation occurred" or "Failed to fetch dynamically imported module" after lots of HMR churn:
```bash
rm -rf .svelte-kit node_modules/.vite
npm run dev
```
Vite caches the SvelteKit module graph and HMR can't always recover from import-graph rewires.

## Decisions locked in (project memory has these too)

- **License**: AGPL-3.0 (overrides spec's MIT). Don't replace `LICENSE` in Phase 6.
- **Branch**: work directly on `main`, commit per phase checkpoint.
- **bcrypt rounds**: 10 (matches spec).
- **Resolved dep versions** (all within spec's `^` ranges): Vite 8.0.10, SvelteKit 2.58, Svelte 5.55, Tailwind 4.2.4, Drizzle 0.45.2, libSQL 0.17.3, TypeScript 6.0.3.
- **Geist font**: bundled at `static/fonts/Geist-Variable.woff2` (one-time download from `vercel/geist-font`).
- **Placeholder app icons**: solid violet PNGs generated programmatically. Replace before public release.
- **Outbound email**: not wired. Password reset links log to dev console; no SMTP yet. Decide before Phase 5 (Resend / SES / nodemailer).
- **Postmark inbound webhook secret** lives in `INBOUND_EMAIL_SECRET` (in `.env.example`). Not wired yet — Phase 5.

## Critical implementation notes

These are the things that bit during the build and would trip up a fresh session:

- **`$lib/server/*` is server-only.** The SvelteKit vite plugin throws "An impossible situation occurred" if a client-bundled module transitively imports anything under it — even type-only imports can trip it during HMR. Public runtime constants/types that are needed by both server and client live in `$lib/*` (e.g. `src/lib/interactions.ts` for `INTERACTION_TYPES` / `InteractionType` / `isInteractionType`). The server file imports + re-exports them.
- **FTS5 migrations.** Trigger bodies (`CREATE TRIGGER … BEGIN … END;`) contain inner semicolons. Don't naive-split — `src/lib/server/migrate.ts` uses `client.executeMultiple()`. Triggers are mirrored across `people`, `companies`, `interactions`. A `rebuild` is run on startup if `<table>_fts` row count drifts from the source table (covers indexes added after rows already exist).
- **Janitor at startup** clears `source='parsing'` rows older than 10 minutes (covers crashed enrichments).
- **SSRF guard is redirect-aware** in `src/lib/server/og.ts`: `redirect: 'manual'` + `assertPublicUrl()` on every Location hop, max 5 hops, 10s timeout, 2 MB body cap.
- **Classifier**: 16 assertion cases in `scripts/check-classify.ts`, wired into `npm run check`. `github.com/{org}/{repo}` correctly resolves to `company`, not `person`.
- **Sessions**: id format `region:cuid2`. Single-DB deployments use `region='local'`. The multi-region scaffolding is in place but unused (`emailRouting` table, `primaryDb()`, etc.) so it can be activated later without a migration.
- **Bootstrap escape hatch**: `DISABLE_REGISTRATION=1` still allows registration when the `users` table is empty.
- **Drizzle index syntax**: spec uses object form (`(t) => ({ ... })`). I used array form (`(t) => [...]`) which is what 0.45 expects. Don't switch back.
- **Svelte 5 gotchas**:
  - `let foo = $state(propValue)` for an initial value triggers `state_referenced_locally`. Suppress with `// svelte-ignore state_referenced_locally` when the intent is "snapshot the prop once".
  - DOM refs need `let el = $state<HTMLInputElement | undefined>(undefined)`, not a plain `let`.
  - `{@const x = ...}` must be the **immediate** child of `{#each}` / `{#if}` / etc. — putting it inside a `<button>` or `<a>` after the opening tag is invalid.
  - Lucide icons typed as a strict `Component<{}, {}, string>` rejects each icon's specific type. Use a permissive `IconLike = any` for icon props (see `FieldRow.svelte`).
- **`bind:this` on a component** + `export function ...` works in Svelte 5 runes mode (used in `SaveBar.focus()`, called from layout's `/` shortcut once).
- **Form actions** are server-side; the SvelteKit `use:enhance` upgrades them when JS is present. `/interactions/new` typeahead requires JS — without JS the user can't attach people from that page (they can edit afterwards).

## What's actually built

**Routes**:
- `/` — landing (signed-out) / dashboard with counts + Recently saved + Recent interactions (signed-in)
- `/auth`, `/auth/forgot-password`, `/auth/reset-password/[token]`, `/auth/logout`
- `/people`, `/people/new`, `/people/[id]`
- `/companies`, `/companies/new`, `/companies/[id]`
- `/interactions`, `/interactions/new`, `/interactions/[id]`
- `/api/save`, `/api/people[...]`, `/api/companies[...]`, `/api/interactions[...]` (with `/[id]/people` for attach/detach)

**Components**: `SaveBar`, `EntityRow`, `FieldRow`, `NotesEditor`, `Landing`, `PersonPicker`, `CompanyPicker`, `InteractionRow`, `Toaster`.

**Server modules**: `db`, `schema`, `migrate`, `auth`, `cookies`, `rate-limit`, `sanitize`, `url`, `classify`, `og`, `search`, `savePerson`, `saveCompany`, `saveInteraction`, `interactions-query`.

**Keyboard**:
- `/` → focus search input on the current list page
- `j/k` (or arrows) → navigate rows on `/people`, `/companies`
- `Enter` / `e` → open selected row
- `*` → toggle favorite
- `#` → toggle archive
- `/interactions` does **not** have row keyboard nav yet (deferred — should land in Phase 4 polish).

**Verified end-to-end**: paste `https://stripe.com` → enrichment fills name/description/logo within ~4s; paste `linkedin.com/in/satyanadella` → enriched name + avatar; FTS body resync confirmed via `PATCH /api/interactions/[id]` with a unique word; SSRF guard rejects `127.0.0.1` (and other private ranges); cookie survives a full server restart.

## Deferred items (carry into Phase 4 or later)

These were called out by the spec but skipped or stubbed:

- **Companion banner** on `/people/[id]`: "Looks like {name} works at {employer}. Add as a company?" — JSON-LD `worksFor` already auto-links to existing companies but doesn't suggest creating new ones. Phase 2 deferred → Phase 4.
- **Tags** (`/api/tags`, `TagInput`, scope-aware filter chips) — schema is in place; UI not built. Phase 4.
- **`CommandPalette`** (`cmd/ctrl-k`) — unified parallel FTS across all three tables. Phase 4.
- **`ShortcutHelp`** (`?`) overlay listing every shortcut. Phase 4.
- **Reminders** CRUD + sidebar popover sorted by `remindAt` ascending. (No delivery in v1.) Phase 4.
- **Empty-state polish** (single-sentence prompt + single CTA per list) — current empty states are functional but not polished. Phase 4.
- **`j/k` keyboard nav on `/interactions`** — list pages for people/companies have it; interactions doesn't.
- **Auto-refresh after enrichment** — a fresh stub shows the spinner indicator next to the name (`source='parsing'`) but the page doesn't poll. User refresh required to see enriched data on the detail page; the SaveBar redirect lands on the stub. Spec says "UI polls or invalidates to surface enrichment" — implement a small `setInterval` invalidate or SSE.
- **`+error.svelte`** — there's no custom error page; SvelteKit's default boundary renders. Optional polish.
- **Bookmarklet snippet in Settings**, **CSV import/export**, **`/save` PWA share-target route**, **`/api/inbound-email` Postmark webhook**, **`/health`** — all Phase 5.
- **README, SECURITY.md, GitHub Actions (`ci.yml`, `docker.yml`, `fly-deploy.yml`)** — Phase 6.

## Risk notes for the next session

- **Delete-with-undo on `/interactions/[id]`** uses a 5.5s `setTimeout` on the client. Tab backgrounding can throttle/kill the timer. Spec calls for hard delete; if you want robust undo, switch to soft-delete (`deleted_at` column) — schema change required.
- **SaveBar redirects to the freshly-saved entity** before enrichment finishes. The detail page shows the parsing spinner but doesn't refresh. See "Auto-refresh after enrichment" above.
- **CSP `script-src: 'self'`** with SvelteKit-injected nonces: any inline event handler outside SvelteKit's hydration code will be blocked. The dashboard uses none — keep it that way.
- **PersonPicker / CompanyPicker dropdowns** were not stress-tested in a real browser (no Playwright/gstack browse available). Code review showed positioning + keyboard nav looked correct. The 150ms-debounce + `onmousedown`-vs-`onblur` race is the most likely place for a real-browser bug.

## Suggested next move

Start **Phase 4 — Search, tags, polish** per the spec's bullet list:
1. Tags CRUD + `TagInput` component (scope-aware: person / company / interaction). Filter chips on lists.
2. `CommandPalette` (`cmd/ctrl-k`).
3. `ShortcutHelp` (`?`).
4. Empty-state polish.
5. Reminders.
6. Companion suggestion banner (deferred from Phase 2).
7. Wire `j/k/Enter/e` on `/interactions` for parity.

Commit per checkpoint, same pattern as Phases 0–3.
