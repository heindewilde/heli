# Gusto build progress

This file is the handoff note. Read `GUSTO.md` (the spec) and `CLAUDE.md` (the working strategy) first, then this for current state.

## Where we are

**Phases 0–4 of `GUSTO.md` are done.** Phases 5 and 6 remain.

```
edcd9d4  Phase 0  bootstrap (SvelteKit + Tailwind v4 + Geist)
3534bcd  Phase 1  persistence & auth
dff2b4c  Phase 2  People & Companies — paste-a-link save + lists + detail
5063e49  Phase 3  Interactions
6d2cf40  fix      QA pass — Tailwind class, p-shortcut, whitespace-pre-wrap
e04d5b7  fix      stop importing $lib/server/saveInteraction from client code
06a1ab0  notes    progress.md handoff note
<sha>    Phase 4  Search, tags, polish — palette, ?, reminders, banner, j/k
```

Phase 4 went on the branch `claude/review-spec-continue-K6iKV` (per the harness directive for this session). Cherry-pick or merge into main when convenient.

## How to run / pick up

```bash
npm install          # if node_modules missing
npm run dev          # vite dev on http://localhost:5173
npm run check        # svelte-check + tsx scripts/check-classify.ts
```

Dev login (registered fresh during the Phase 4 smoke): `test@gusto.local` / `hunter2hunter`.

If the dev server starts throwing "An impossible situation occurred" or "Failed to fetch dynamically imported module" after lots of HMR churn:
```bash
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

## Decisions locked in (project memory has these too)

- **License**: AGPL-3.0 (overrides spec's MIT). Don't replace `LICENSE` in Phase 6.
- **Branch**: typically `main` per `CLAUDE.md`, but Phase 4 was committed to `claude/review-spec-continue-K6iKV` because the harness directive forced that branch for this session. Future phases can return to `main` unless the same directive is in effect.
- **bcrypt rounds**: 10 (matches spec).
- **Resolved dep versions** unchanged from earlier phases.
- **Geist font**: bundled at `static/fonts/Geist-Variable.woff2`.
- **Outbound email**: not wired. Decide before Phase 5 (Resend / SES / nodemailer).
- **Postmark inbound webhook secret** lives in `INBOUND_EMAIL_SECRET`. Phase 5.

## What Phase 4 shipped

**Schema additions (idempotent ALTERs in `migrate.ts`):**
- `people.suggested_company_name`, `people.suggested_company_url` — populated by enrichment when JSON-LD `worksFor` is present but no matching company exists; cleared when `companyId` is set (manual link, suggestion accepted, or auto-link).

**Server modules:**
- `tags.ts` — `slugify`, `ensureTag`, `attachTag`, `detachTag`, `deleteTag`, `listTagsWithCounts`, `getTagsForEntity`, `getTagsForEntities`, `findTagBySlug`, `entityIdsForTag`. Scope = `'person' | 'company' | 'interaction'`.
- `reminders-query.ts` — `listReminders` resolves `refLabel` + `refHref` from the underlying entity in one extra query per kind.
- `search.ts` — `searchAll(userId, region, q, perKind)` runs three FTS5 queries in parallel and returns a flat list of `CommandHit` for the palette.

**API endpoints:**
- `POST/GET/DELETE /api/tags` (DELETE detaches; entity-level)
- `DELETE /api/tags/[id]` (deletes the tag itself, cascades the join rows)
- `GET/POST /api/reminders`, `DELETE /api/reminders/[id]`
- `GET /api/search?q=` (palette feed)

**Components:**
- `TagInput.svelte` — chip strip + autocomplete from server-fetched suggestions; create-new on Enter; backspace to remove last.
- `CommandPalette.svelte` — bound to `bind:open`, owns the cmd/ctrl-K dialog. Debounced (120ms) calls to `/api/search`. P/C/I tag chip on each row.
- `ShortcutHelp.svelte` — `?` overlay listing globals + list shortcuts.
- `RemindersPopover.svelte` — sidebar popover under the tab nav. Overdue items get a warning dot. Clicking the entity link closes the popover.
- `AddReminder.svelte` — small inline date-picker on detail pages; defaults to "next week 09:00".

**Layout:**
- Topbar: search button + help icon (cmd-K / ? hints).
- Sidebar: tabs + reminders popover.
- Mounts `CommandPalette` and `ShortcutHelp` at the root, gated on signed-in user. Plain `?` opens help; `cmd/ctrl-K` toggles palette. `bindKeys` deliberately skips meta-modified events, so the palette has its own listener.
- `+layout.server.ts` loads up to 25 upcoming reminders with resolved `refLabel`/`refHref`.

**List pages:**
- `/people`, `/companies`, `/interactions` all render scope-aware tag filter chips (top 8 by name) and an "x" pill for the active filter. Tag badges render under each row when present.
- `?tag=<slug>` filters the list. Empty FTS results post-tag-filter short-circuit early.
- Empty-state polish: separate prompts for "no rows yet" / "no rows match search" / "no rows in this filter / tag".
- `/interactions` now has `j/k`/`ArrowUp`/`ArrowDown` row nav and `Enter`/`e` to open. `InteractionRow` accepts a `selected` prop.

**Detail pages:**
- Each detail (`/people/[id]`, `/companies/[id]`, `/interactions/[id]`) mounts `TagInput` + `AddReminder` in the side panel, fetching tag suggestions client-side from `/api/tags?scope=…`.
- `/people/[id]` renders the **companion suggestion banner** when `suggestedCompanyName` is set and `companyId` is null. The load function recomputes the suggested-domain match against the user's companies on every load, so a company added later auto-resolves the suggestion target. Three actions: Link (auto-match), Add (POST `/api/save` with the suggested URL → link the resulting company), Dismiss (clears the suggested-* columns via PATCH).

## Critical implementation notes (carry forward)

Everything from prior phases, plus:

- **Tags scope is enforced server-side.** Client passes `{scope, name, entityId}`; server validates the tag belongs to the user *and* the right scope before joining. Don't loosen this — a tag id from one scope must not be attachable to another entity type.
- **Tag slug uniqueness** is per `(userId, slug, scope)`. Same slug can exist as `person` and `interaction` simultaneously and they don't collide.
- **`{@const ...}` placement.** Svelte 5 only accepts it as the immediate child of `{#each}`/`{#if}`/`{#snippet}`. The interactions list page derives `flatIndexById` in the script block instead.
- **CommandPalette key handler is separate from `bindKeys`.** `bindKeys` short-circuits on `meta/ctrl/alt` modifiers and on input targets; the palette needs the meta key, so it has its own `keydown` listener registered in `+layout.svelte`. The `?` handler is also separate (plain key, but explicit to keep input handling correct).
- **`lastQuery` in CommandPalette is `$state(...)`.** Svelte 5 warns on `non_reactive_update` for plain `let` variables that get assigned during reactivity. If you add new in-component state, prefer `$state` even when it's not directly bound to a template node.
- **Empty-DB freshness.** Phase 4 was tested with a fresh DB created during the smoke run. `data/gusto.db` now contains `test@gusto.local` again with one LinkedIn person, one VIP tag (since detached), and one reminder. Safe to delete to restart.

## What's actually built (cumulative)

**Routes (added in Phase 4 in italics):**
- `/`, `/auth/*`, `/auth/logout`
- `/people`, `/people/new`, `/people/[id]`
- `/companies`, `/companies/new`, `/companies/[id]`
- `/interactions`, `/interactions/new`, `/interactions/[id]`
- `/api/save`, `/api/people[...]`, `/api/companies[...]`, `/api/interactions[...]` (with `/[id]/people` for attach/detach)
- *`/api/tags`, `/api/tags/[id]`, `/api/reminders`, `/api/reminders/[id]`, `/api/search`*

**Components (added in Phase 4 in italics):** `SaveBar`, `EntityRow`, `FieldRow`, `NotesEditor`, `Landing`, `PersonPicker`, `CompanyPicker`, `InteractionRow`, `Toaster`, *`TagInput`, `CommandPalette`, `ShortcutHelp`, `RemindersPopover`, `AddReminder`*.

**Server modules:** `db`, `schema`, `migrate`, `auth`, `cookies`, `rate-limit`, `sanitize`, `url`, `classify`, `og`, `search`, `savePerson`, `saveCompany`, `saveInteraction`, `interactions-query`, *`tags`, `reminders-query`*.

**Keyboard:**
- `/` → focus search input on the current list page
- `cmd/ctrl-k` → CommandPalette
- `?` → ShortcutHelp
- `j/k` (or arrows) → navigate rows on `/people`, `/companies`, `/interactions`
- `Enter` / `e` → open selected row
- `*` → toggle favorite (people/companies only)
- `#` → toggle archive (people/companies only)

**Verified end-to-end (Phase 4 smoke):**
- Register → 200, session cookie set; `/api/tags?scope=person` → 200 `{items: []}`
- Save linkedin.com/in/satyanadella → 201; person stub created
- Tag CRUD: create+attach (201), list with counts (200), detach (204)
- Reminder CRUD: create (201), list with resolved labels (200)
- Unified search (`/api/search?q=satya`) returns the person hit
- `/people?tag=vip` filters render 200 with the tagged person

## Deferred items (Phase 5 or later)

- **Auto-refresh after enrichment** — still required; SaveBar redirects to a stub that doesn't poll. Add `setInterval` invalidate or SSE on `/people/[id]` and `/companies/[id]` while `source='parsing'`.
- **`+error.svelte`** — still defaulted to SvelteKit's boundary.
- **CSV import/export, bookmarklet snippet in Settings, `/save` PWA share-target route, `/api/inbound-email` Postmark webhook, `/health`** — all Phase 5.
- **README, SECURITY.md, GitHub Actions** — Phase 6.
- **Reminder delivery** — none in v1 by spec. Popover only.
- **Tag *delete* UI** (`/api/tags/[id]`) — endpoint exists but no UI. The TagInput only detaches (preserves the tag). Add a "manage tags" page in Phase 5/6 if it becomes painful.
- **Sort dropdown on /people and /companies** — `sort` query param is parsed but no UI exposes it. Cheap to add when it matters.

## Risk notes for the next session

- **Companion banner re-fetch.** `/people/[id]` recomputes the suggested-domain → company match on every load. If the user has thousands of companies this is one extra indexed lookup; fine. If it ever becomes slow, denormalize the match id at enrichment time.
- **SaveBar redirect** still lands on a parsing stub. Phase 4 didn't address auto-refresh — it's the same risk as before.
- **Bookmarklet/CSP warning carried forward** — CSP `script-src: 'self'` still rejects inline event handlers outside SvelteKit hydration. Don't add inline `on…` to any non-SvelteKit-injected element.
- **Tag input race** — TagInput uses `onmousedown` to commit before `onblur` closes the dropdown (same pattern as PersonPicker). Worth a real-browser stress test when QA is possible.

## Suggested next move

Phase 5 — capture surfaces & data portability:
1. Settings page with bookmarklet snippet (auto-built from `APP_DOMAIN`).
2. `/save?url=` share-target route (PWA + manifest update if needed).
3. CSV export (stream) + CSV import (background, polled progress).
4. `/api/inbound-email` Postmark webhook with HMAC verification.
5. `/health` endpoint (200 ok).
6. Wire outbound email (Resend / SES / nodemailer) for password resets so the dev-console-log fallback can be retired.

Then Phase 6 — README, SECURITY.md, GitHub Actions, optional `gusto.sh` Fly app.
