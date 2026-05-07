# Gusto build progress

This file is the handoff note. Read `GUSTO.md` (the spec) and `CLAUDE.md` (the working strategy) first, then this for current state.

## Where we are

**Phases 0–5 of `GUSTO.md` are done.** Phase 6 (ship) remains.

```
edcd9d4  Phase 0  bootstrap (SvelteKit + Tailwind v4 + Geist)
3534bcd  Phase 1  persistence & auth
dff2b4c  Phase 2  People & Companies — paste-a-link save + lists + detail
5063e49  Phase 3  Interactions
6d2cf40  fix      QA pass — Tailwind class, p-shortcut, whitespace-pre-wrap
e04d5b7  fix      stop importing $lib/server/saveInteraction from client code
06a1ab0  notes    progress.md handoff note
90cb90b  Phase 4  Search, tags, polish
6bcae73  spec     drop CSV import + Postmark inbound-email from v1 scope
<sha>    Phase 5  Capture surfaces & data portability
```

After Phase 5 the feature branch (`claude/review-spec-continue-K6iKV`) was fast-forwarded onto `main`; both branches now point at the Phase-5 commit. Future phases can go straight to `main` unless a directive forces a feature branch again.

## How to run / pick up

```bash
npm install          # if node_modules missing
npm run dev          # vite dev on http://localhost:5173
npm run check        # svelte-check + tsx scripts/check-classify.ts
```

Dev login (registered fresh during the Phase 5 smoke): `user@gusto.local` / `newpassword123` (changed during the smoke; reset DB to start over).

If the dev server starts throwing "An impossible situation occurred" or "Failed to fetch dynamically imported module" after lots of HMR churn:
```bash
rm -rf .svelte-kit node_modules/.vite
npm run dev
```

## Decisions locked in

- **License**: AGPL-3.0 (overrides spec's MIT). Don't replace `LICENSE` in Phase 6.
- **Branch**: `main` is the canonical line. Phase 4–5 work was done on `claude/review-spec-continue-K6iKV` per a session directive, then merged forward.
- **bcrypt rounds**: 10 (matches spec).
- **Resolved dep versions**: unchanged from earlier phases.
- **Geist font**: bundled at `static/fonts/Geist-Variable.woff2`.
- **Outbound email**: still not wired. Password reset links continue to log to dev console only. Pick a provider before Phase 6 ship (Resend / SES / nodemailer).
- **Inbound email and CSV import are out of scope for v1.** Spec was trimmed mid-Phase 4; rate-limit table no longer carries the `inboundEmail` entry.

## What Phase 5 shipped

**New routes:**
- `GET /health` — plain `200 ok` text/plain. Used by the Dockerfile healthcheck.
- `/save?url=&text=&title=` — PWA share-target + bookmarklet landing. Pulls the first http(s) URL from any of the three params (URL_RE matches inside free-form text), runs the standard save pipeline (rate-limit → cleanUrl → assertPublicUrl → classify → savePerson/saveCompany), and 303s to the detail page. Unauth gets redirected to `/auth?next=…` and round-trips back after sign-in. Errors render a small landing with a typed message.
- `/settings` — five sections: bookmarklet, CSV export, account (username / email / password), sessions, danger zone. Settings link icon now sits in the topbar.

**New API:**
- `GET /api/export?kind=people|companies|interactions` — streamed CSV via a `ReadableStream<Uint8Array>` (`src/lib/server/csv.ts`). RFC 4180 quoting; `Content-Disposition: attachment; filename="gusto-<kind>-<date>.csv"`. Tags are pipe-separated; for interactions, `person_ids` is also pipe-separated.
- `POST /api/user` — single endpoint dispatched by `action`: `updateUsername`, `updateEmail` (verifies current password), `updatePassword` (verifies current password), `signOutOtherDevices`, `deleteAccount` (verifies current password, cascades through schema, clears the session cookie).

**Server modules:**
- `src/lib/server/csv.ts` — `csvLine`, `csvStream`, `isoDate`. Tiny, no external deps.
- `auth.ts` gained `verifyPassword(userId, region, password)` and `deleteAccount(userId, region)`.

**`/auth` updates:**
- Reads `?next=` and validates it's same-origin (must start with `/`, not `//`). Login + register actions read `next` from the form and redirect there. `/save?url=` is the main consumer.

**Bookmarklet shape (important deviation from spec):**
The spec showed `javascript:fetch('/api/save', …, {credentials:'include'})`, but that only works when invoked from a Gusto-origin tab — the cookie isn't sent cross-origin and we don't want to relax CORS. The deployed bookmarklet is therefore:
```js
javascript:void(window.location='<origin>/save?url='+encodeURIComponent(location.href))
```
A tab navigation, not a fetch. Origin is computed server-side from the request URL so localhost works in dev and gusto.sh works in prod. Settings explicitly documents the navigation-not-fetch behavior.

## Critical implementation notes (carry forward)

Everything from prior phases, plus:

- **`assertPublicUrl` SSRF guard runs in `/save` too.** The same redirect-aware URL pipeline applies — never bypass it because something is "just" a share-target.
- **`?next=` validation is critical.** Always go through `safeNext` before redirecting. A `//attacker.com/foo` would otherwise be a same-origin-looking phishing redirect.
- **`/api/user` requires the cookie to be present**, not just `locals.user`, because `signOutOtherDevices` keys on the *current* session id (not just user id) to keep the requester logged in. If you ever change the session-cookie name, update the read in `/api/user/+server.ts`.
- **CSV export is a single transaction worth of reads.** For huge accounts (10k+ interactions) the whole result set materializes before streaming. Acceptable for v1; if it stops being acceptable, page through with cursor + `LIMIT` and yield batches.
- **Deleting an account cascades via schema.** All FKs use `ON DELETE CASCADE` to `users.id`; no extra cleanup needed beyond removing the `email_routing` entry in the primary DB.

## What's actually built (cumulative)

**Routes (added in Phase 5 in italics):**
- `/`, `/auth/*`, `/auth/logout`
- `/people`, `/people/new`, `/people/[id]`
- `/companies`, `/companies/new`, `/companies/[id]`
- `/interactions`, `/interactions/new`, `/interactions/[id]`
- *`/save`, `/settings`, `/health`*
- `/api/save`, `/api/people[...]`, `/api/companies[...]`, `/api/interactions[...]` (with `/[id]/people` for attach/detach)
- `/api/tags`, `/api/tags/[id]`, `/api/reminders`, `/api/reminders/[id]`, `/api/search`
- *`/api/export`, `/api/user`*

**Components:** `SaveBar`, `EntityRow`, `FieldRow`, `NotesEditor`, `Landing`, `PersonPicker`, `CompanyPicker`, `InteractionRow`, `Toaster`, `TagInput`, `CommandPalette`, `ShortcutHelp`, `RemindersPopover`, `AddReminder`. (No new components in Phase 5 — Settings is its own page.)

**Server modules (added in Phase 5 in italics):** `db`, `schema`, `migrate`, `auth`, `cookies`, `rate-limit`, `sanitize`, `url`, `classify`, `og`, `search`, `savePerson`, `saveCompany`, `saveInteraction`, `interactions-query`, `tags`, `reminders-query`, *`csv`*.

**Verified end-to-end (Phase 5 smoke):**
- `/health` → 200 `ok`
- Register → 200; settings page → 200 with bookmarklet rendered
- `/api/export?kind=` for all three kinds → 200 with proper CSV headers + content
- `/save?url=https://stripe.com` (authed) → 303 to `/companies/<id>`
- `/save?text=<free text containing URL>` → 303 to the matching entity
- `/save` no URL → friendly error page
- `/save` unauth → 303 to `/auth?next=/save?…`, round-trips after sign-in
- `/api/user` updateUsername/updatePassword (correct + wrong-current 403)/signOutOtherDevices all behave as expected; invalid action → 400

## Deferred / open items going into Phase 6

- **Outbound email** — `requestPasswordReset` returns a token and the dev console logs the link. Wire a provider so the link actually mails.
- **Auto-refresh after enrichment** — still required; SaveBar redirects to a stub that doesn't poll. Add `setInterval` invalidate or SSE on `/people/[id]` and `/companies/[id]` while `source='parsing'`.
- **`+error.svelte`** — still defaults to SvelteKit's boundary.
- **Tag *delete* UI** (`/api/tags/[id]`) — endpoint exists but no UI. The TagInput only detaches.
- **README, SECURITY.md, GitHub Actions (`ci.yml`, `docker.yml`, `fly-deploy.yml`), Dockerfile sanity, optional `gusto.sh` Fly app** — Phase 6.

## Risk notes for the next session

- **Bookmarklet only works on browsers that support JavaScript URLs in bookmarks.** Most do; Safari iOS sometimes strips them. The `/save` route still works as a normal link (e.g., from email or a share sheet).
- **PWA share-target** requires the manifest to be served and the user to have installed the app. iOS Safari only added share-target support recently and is fussy. Gracefully degrades — the same `/save?url=` works from desktop browsers without install.
- **`/api/export` streams from a single Drizzle `.select().from()` call**, which materializes in memory. For very large accounts this is a memory cliff. Acceptable for v1; revisit if anyone hits it.
- **Account deletion is permanent and there's no soft-delete fallback.** The "are you sure" `confirm()` is the only guard. If you want a 30-day undo window, add a `deleted_at` column to `users` and gate the cascade.

## Suggested next move

Phase 6 — ship:
1. README with pitch, screenshots placeholder, `docker compose up` quickstart, env var table, backup = `cp data/gusto.db backup.db`.
2. SECURITY.md (responsible disclosure, contact email, supported versions).
3. LICENSE — already AGPL-3.0; leave it (overrides spec's MIT).
4. GitHub Actions: `ci.yml` (Node 22 + `npm run check`), `docker.yml` (build + push to GHCR on tag), `fly-deploy.yml` (deploy on `main`).
5. Wire outbound email so password reset actually mails.
6. Optional: domain `gusto.sh` → Fly app, Let's Encrypt cert.
