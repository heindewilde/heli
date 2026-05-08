# Gusto build progress

This file is the handoff note. Read `GUSTO.md` (the spec) and `CLAUDE.md` (the working strategy) first, then this for current state.

## Where we are

**Phases 0–6 of `GUSTO.md` are done.** Only **Phase 7 (Ship)** — README, SECURITY.md, CI/CD, optional Fly deploy — remains.

```
Phase 0  bootstrap (SvelteKit + Tailwind v4 + Geist)
Phase 1  persistence & auth
Phase 2  People & Companies — paste-a-link save + lists + detail
Phase 3  Interactions
Phase 4  Search, tags, polish
Phase 5  Capture surfaces & data portability
UX 1–21  prioritised polish from ux-scan.md (4 batches; merged into main)
spec     Phase 6 added; Ship bumped to Phase 7
Phase 6  Projects (5 commits: schema → server/API → routes/UI → surfaces → checkpoint)
```

`main` is the canonical line. Pushing directly to `main` started getting blocked with HTTP 403 part-way through the UX work (looks like a branch-protection rule was added remotely), so PRs are now opened from short-lived branches and merged via the GitHub MCP. The first sync PR (#1) brought the whole feature branch back onto main; Phase 6 commits go straight to `main` locally and ride to origin via the same PR-and-merge flow when a push is needed.

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

## What Phase 6 (Projects) shipped

**New entity** — `projects` is a cross-scope container that tags can't model. A project has members from multiple entity types (people + companies) and a real lifecycle (active → paused → archived). Out of scope and explicitly skipped: file uploads (external links instead), time tracking (rate is recorded only), stages/pipelines, tasks/checklists, per-project permissions.

**Schema** (`src/lib/server/schema.ts`, idempotent CREATE TABLE IF NOT EXISTS in `migrate.ts`):
- `projects(id, userId, name, description, status, startDate, endDate, billingType, hourlyRate, fixedFee, currency, nextStep, createdAt, updatedAt)` — money fields stored as integer **cents** to avoid float drift; status is a text enum, no separate is_archived flag.
- `project_links(id, projectId, url, label, createdAt)` — the v1 alternative to file uploads.
- `project_people`, `project_companies`, `interaction_projects` — m2m joins.
- `project_tags` — m2m to existing tags table; `TAG_SCOPES` extended with `'project'` so all the existing tag UI and APIs Just Work.
- `REMINDER_KINDS` extended with `'project'`; reminders-query and the API both resolve project labels and `/projects/[id]` hrefs.
- `projects_fts` virtual table over `(name, description, next_step)` with the standard ai/ad/au triggers; `rebuildFts()` iterates the new table alongside the existing three.

**Server modules:**
- `saveProject.ts` — create/update/delete + member sub-resources + link CRUD. Sanitises decimals → cents, validates ISO 4217 currency, accepts dates as ISO strings or epoch ms. Cross-field rules: `billingType=none` clears all money fields; `hourly` clears `fixedFee`; `fixed` clears `hourlyRate`.
- `projects-query.ts` — `listProjects` (with q/status/personId/companyId/tag filters and four sort modes including `lastInteraction`), `getProject` (parallel-fetches links + members + interactions + tags), `projectsForPerson`, `projectsForCompany`, `projectsTogether`, `suggestProjectsFor`, `projectsForInteractions`, `searchProjects` (typeahead).
- `search.ts` — `parseQueryScope` regex matches `pr:` *before* `p:` (alternation order matters); `searchAll` runs a fourth FTS5 query against `projects_fts` excluding archived.

**API:**
- `GET/POST /api/projects` (list + create; `?mode=typeahead` for ProjectPicker), `GET/PATCH/DELETE /api/projects/[id]`, member sub-resources for people/companies/interactions, full link CRUD, `GET /api/projects/suggest?personIds=&companyId=&exclude=`, `?kind=projects` on `/api/export` (17-column CSV with UTF-8 BOM, links as `;`-separated `url|label` pairs).

**Routes:**
- `/projects` — status filter chips (active default), tag filter, sort dropdown (recently updated default; recent / endDate / name / lastInteraction), FTS, j/k/Enter/e nav, RowTagAdder per row.
- `/projects/new` — name, description, next step, status radios, dates, billing block (none/hourly+rate+currency / fixed+fee+currency), people multi-picker, company picker with "add to project" stash for multiple companies. Decimal-dollars input → integer cents on save. Redirects to `/projects/[id]?just=1` so the SaveBanner Undo grace fires.
- `/projects/[id]` — header (inline-editable name + StatusChip with quick-toggle + dates + overdue badge), main column (description, links, people, companies, scoped interactions timeline), side panel (next step, billing card with Intl.NumberFormat, tags, reminder).

**Components:** `ProjectRow`, `StatusChip` (active/paused/archived with quick-toggle popover), `LinksEditor` (paste-and-add, edit-in-place, https-only), `ProjectPicker` (multi-select with `suggestedIds` set for the auto-suggest treatment).

**Surfaces on existing entities:**
- Dashboard: "Active projects" count card (4-col grid) + "Ending soon" mini-section listing active projects with `endDate` within 14 days OR overdue, ordered by endDate asc, with overdue badge in the warning tone.
- `/people/[id]`: "Together at {Company}" subsection (only when person has a linked company that's also a project member) + "Other projects" subsection.
- `/companies/[id]`: "Projects" section.
- `/interactions/new`: ProjectPicker with debounced (250ms) auto-suggest from `/api/projects/suggest`. Suggested entries get a Sparkles icon + dashed border until confirmed by save; manual additions are dismissed-from-suggestions to avoid visual duplication; explicit removals are remembered so they don't re-surface on the next selection change.
- `/interactions/[id]`: edit-mode picker; read-mode chips with FolderKanban + StatusChip, click-through to `/projects/[id]`.

**CommandPalette:** `pr:` scope prefix (parsed before `p:`), PR result chips, FolderKanban icon. ShortcutHelp lists `pr:`.

**Hooks-based auth:** `/projects/*` added to `PROTECTED_PATTERNS` so logged-out users get bounced to `/auth?next=/projects/...` like other authed pages.

**Layout nav:** fourth tab "Projects" with FolderKanban icon. Mobile drawer auto-includes it.

## Critical implementation notes (carry forward)

Everything from prior phases, plus:

- **Money is cents.** Never store floats. UI converts decimal → cents on form submit (`× 100, Math.round`) and renders via `Intl.NumberFormat({ style: 'currency', currency })`. `currency` is required ISO 4217 when `billingType !== 'none'`.
- **Status is a single column, not a flag.** Projects use `status: 'active' | 'paused' | 'archived'` rather than `isArchived: 0|1` like people/companies. The default list view hides archived; suggest API skips it; dashboard count only includes active. The /api/projects?status=archived path is the way back.
- **Auto-suggest needs three bookkeeping sets** in `/interactions/new`: `selectedProjects` (everything in the picker), `suggestedIds` (subset that came from suggest, render with Sparkles), `dismissedSuggestionIds` (manual adds + explicit removals; sent as `?exclude=` so the same project doesn't re-suggest).
- **`pr:` MUST come before `p:` in the regex alternation.** Both client mirror (CommandPalette.svelte) and server (search.ts) use `/^(pr|p|c|i):\s*(.*)$/i`. Reordering breaks everything.
- **`{@const}` placement still bites.** Used inside `{#each}` and `{#if}` blocks throughout (e.g., `{@const overdue = ...}`); never at the top level of a Svelte component.
- **Status casts at boundaries.** Drizzle `text()` columns infer as `string`, not the union. The Project type's `status` is `string`; cast `as ProjectStatus` when handing it to `StatusChip` and similar typed components.

## What's actually built (cumulative, top-level)

**Routes:** `/`, `/auth/*`, `/save`, `/settings`, `/health`, `/people[…]`, `/companies[…]`, `/interactions[…]`, **`/projects[…]`**.

**APIs:** `/api/save`, `/api/people[…]`, `/api/companies[…]`, `/api/interactions[…]`, `/api/tags[…]`, `/api/reminders[…]`, `/api/search`, `/api/user`, `/api/export`, **`/api/projects[…]`**, **`/api/projects/suggest`**, **`/api/projects/[id]/{people,companies,interactions,links}`**.

**Components:** the existing set plus **`ProjectRow`**, **`StatusChip`**, **`LinksEditor`**, **`ProjectPicker`**.

**Server modules:** the existing set plus **`saveProject`**, **`projects-query`** (and `search.ts` extended to include projects + the `pr:` scope).

## Phase 6 checkpoint smoke (passed end-to-end)

1. Create a project with billing `hourly $200/USD`, `endDate=+30d`, link a person + a company → dashboard count goes to 1, project shows on `/people/[id]` Projects + Together-at, on `/companies/[id]` Projects, and on `/projects` list.
2. `cmd-K series` returns Series A in mixed results; `pr:series` scopes to projects-only.
3. Tag the project `vc` → `/api/projects?tag=vc` filters; tag is in CSV export.
4. Add an external link via API → 201; visible on detail page.
5. Set a reminder kind=project → popover renders with `/projects/[id]` href.
6. Auto-suggest by personId returns the project; by companyId returns the project; combining excluded ids removes duplicates.
7. Together-at subsection renders only when the person AND their linked company are both members of the same project.
8. Set `endDate` to yesterday → list, detail, and dashboard "Ending soon" all show overdue badge in danger tone.
9. CSV export starts with `EF BB BF`, has the documented 17 columns, links emit as `url|label` pairs.
10. Archive the project → disappears from default `/projects`, from `/api/projects/suggest`, and from the dashboard active count; `/api/projects?status=archived` shows it again.

`npm run check` clean (0 errors, 0 warnings) at every step.

## Deferred / open items going into Phase 7 (Ship)

- **Outbound email** — `requestPasswordReset` returns a token and the dev console logs the link. Pick a provider (Resend / SES / nodemailer) and wire it.
- **Auto-refresh after enrichment** — already mostly handled by the `pollWhile` helper from UX#1. Verify it covers the project flows (it doesn't need to — projects don't enrich).
- **README, SECURITY.md, GitHub Actions (`ci.yml`, `docker.yml`, `fly-deploy.yml`), Dockerfile sanity, optional `gusto.sh` Fly app** — Phase 7.
- **Tag delete UI** (`/api/tags/[id]`) — endpoint exists but still no UI; the TagInput only detaches. Likely a Settings → "Manage tags" page.
- **Project time-tracking** — explicitly out of scope. If users start asking, add a `time_entries` subsystem (project_id, occurred_at, minutes, note); compute totals at $rate.
- **File uploads on projects** — out of scope. External links cover the contract / deck / brief use case.

## Risk notes for the next session

- **Branch protection on `main`** — direct pushes to `origin/main` started returning HTTP 403 mid-way through the UX work. Keep using the GitHub MCP (`mcp__github__create_pull_request` + `mcp__github__merge_pull_request` with `merge_method: "rebase"`) for each phase commit. Local linear history is preserved; the rebase replay just reassigns SHAs on the remote.
- **`pr:` prefix in cmd-K relies on alternation order** in the parser regex. If anyone "improves" the regex to `[a-z]+:` they'll lose the people/projects disambiguation.
- **interaction_projects + suggest's `dismissedSuggestionIds`** — the auto-suggest UX hangs on three sets in client state. Worth a fresh eye next time someone touches `/interactions/new`.
- **`/api/projects/suggest` returns active only.** Paused projects don't suggest. If a user routinely pauses and resumes work, they may notice suggestions vanish. Document or expand if it bites.
- **Bookmarklet only works on browsers that support JavaScript URLs in bookmarks.** Most do; Safari iOS sometimes strips them. The `/save` route still works as a normal link (e.g., from email or a share sheet).
- **`/api/export` streams from a single `.select()`** which materialises in memory. For very large accounts this is a memory cliff. Acceptable for v1; revisit if anyone hits it.

## Suggested next move

Phase 7 — ship:
1. README with pitch, screenshots placeholder, `docker compose up` quickstart, env var table, backup = `cp data/gusto.db backup.db`.
2. SECURITY.md (responsible disclosure, contact email, supported versions).
3. LICENSE — already AGPL-3.0; leave it (overrides spec's MIT).
4. GitHub Actions: `ci.yml` (Node 22 + `npm run check`), `docker.yml` (build + push to GHCR on tag), `fly-deploy.yml` (deploy on `main`).
5. Wire outbound email so password reset actually mails.
6. Optional: domain `gusto.sh` → Fly app, Let's Encrypt cert.
