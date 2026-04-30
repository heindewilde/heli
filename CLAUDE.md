# Working on Gusto

`GUSTO.md` is the authoritative build spec — do not duplicate it here. This file is a working memo for *how* we're executing it.

## Execution strategy

- **Drive off the 6 phases in `GUSTO.md`.** Each phase ends at a checkpoint with manual verification steps; do not start phase N+1 until phase N's checkpoint is green.
- **One commit per phase checkpoint** on `main` (user approved working directly on main). Commit message names the phase and lists what shipped.
- **Within each phase**: server primitives → routes/UI → keyboard/polish. Spec bullet ordering already reflects this; follow it.
- **TaskCreate scope = current phase only.** Don't pre-populate all 6 phases — context churns.
- **Quality bar = `npm run check` clean + the 10-step manual smoke** in the Verification section. No test framework.

## Decisions locked in

- Branch: `main` (no PRs per phase).
- Geist font: fetch `Geist-Variable.woff2` from `vercel/geist-font` on GitHub into `static/fonts/`. One-time network fetch is approved.
- Pinned dep versions in spec are aggressive (Vite 8, TS 6, Svelte 5.55, SvelteKit 2.57). Spec allows newer minors. If a version doesn't resolve, fall back to nearest released minor and surface the substitution — don't switch frameworks.
- Multi-region session ids (`region:cuid2`) and `email_routing` table are built in from Phase 1 even though single-DB mode doesn't use them. `region='local'` fallback. Don't gut this — it's spec.

## Implementation gotchas to remember

- **FTS5 triggers**: spec only spells out `people` triggers in full. Mirror the `ai/ad/au` triggers for `companies` and `interactions` with the columns listed in their `CREATE VIRTUAL TABLE` blocks. On migration, also seed `INSERT INTO *_fts(rowid, …) SELECT …` so any pre-existing rows are searchable.
- **SSRF guard with redirects**: `fetch` follows redirects automatically; `assertPublicUrl` on the input URL is not enough. Use `redirect: 'manual'` and re-check `assertPublicUrl` on each `Location` header before re-fetching. Cap to a few hops.
- **Bookmarklet** posts to `/api/save` with `credentials:'include'` — only works when invoked from same-origin (i.e. while on a Gusto tab) or when CORS is configured. Document the same-origin limitation in Settings; do not loosen CORS for it.
- **Bootstrap escape hatch**: `DISABLE_REGISTRATION=1` must still allow registration when `users` table is empty. Don't forget this when wiring the register action.
- **Janitor**: at startup, clear `source='parsing'` rows where `updatedAt < now-10min` — covers crashed enrichments mid-fetch.
- **`scripts/check-classify.ts`** needs `tsx` as a devDep; spec lists the script but not the runner. Add it.
- **Sanitize on write**, not on read. Stored notes are already-sanitized HTML.

## Naming

- Brand strings live in `src/lib/branding.ts` only (`APP_NAME`, `APP_DOMAIN`, `APP_TAGLINE`, `BRAND_ACCENT`). Never hardcode "Gusto" elsewhere — the user accepted the payroll-company name collision but wants a single rename point.
