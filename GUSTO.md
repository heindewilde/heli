# Gusto — build spec

## Context

Build **Gusto** (gusto.sh): an open-source, self-hostable, privacy-first **CRM** in the spirit of "lightweight, fast, just the features you need." Three core entity types: **People**, **Companies**, **Interactions**. The signature mechanic: a user pastes a link in the topbar and Gusto classifies and stores it automatically — LinkedIn / social profile URLs become **People**, regular websites become **Companies**, all enriched in the background from OpenGraph tags. Multi-user, email + password, sessions, no telemetry.

This document is the complete spec. The executing Claude Code session will start with an **empty repository** and no other context, so every dependency, config, schema, and behavior is defined here.

A quick naming flag: "Gusto" is also a US payroll company. The user has accepted that risk; do not block on it. Centralize the brand string so it can be renamed without a sweep.

---

## Product principles (carry into every decision)

1. **Private by default.** No telemetry, no analytics, no third-party SDKs in the runtime. Self-hostable from a single docker-compose file. The database is one SQLite file the user can `cp` to back up.
2. **Lightweight.** One process, one DB. Boots in seconds. Runs comfortably on a $5 VPS or a Raspberry Pi.
3. **Just enough features.** People, Companies, Interactions, tags, search, keyboard navigation, dark mode. No team collaboration, no permissions, no pipelines, no email sequencing in v1.
4. **Keyboard-first.** `j/k` to navigate lists, `1/2/3` to switch tabs, `/` to focus search, `?` to show shortcut help, `cmd-k` for global search overlay.
5. **Sync save, async enrich.** When a URL is pasted, insert a stub immediately and return. Fetch metadata in a fire-and-forget background promise. The UI polls or invalidates to surface enrichment.

---

## Tech stack — pinned versions

Use **exactly** these. Newer minors are fine; do not switch frameworks.

```
Node             22 (alpine in Docker)
SvelteKit        ^2.57.0
Svelte           ^5.55.2          // Svelte 5 runes: $state, $derived, $effect
@sveltejs/adapter-node ^5.5.4
@sveltejs/vite-plugin-svelte ^7.0.0
vite             ^8.0.7
typescript       ^6.0.2
svelte-check     latest matching

tailwindcss      ^4.2.2           // v4, configured in CSS not a config file
@tailwindcss/vite        ^4.2.2
@tailwindcss/typography  ^0.5.19  // for note rendering

drizzle-orm      ^0.45.2
drizzle-kit      ^0.31.10         // dev-only
@libsql/client   ^0.17.2          // local SQLite or Turso

bcryptjs         ^3.0.3
@paralleldrive/cuid2 ^3.3.0
jsdom            ^29.0.2          // for OG / JSON-LD parsing
sanitize-html    ^2.17.3
lucide-svelte    ^0.577.0
```

`package.json` scripts:
```
dev:     vite dev
build:   vite build
preview: vite preview
check:   svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
check:watch: same with --watch
```

`.npmrc`: `engine-strict=true`. `engines.node` in package.json: `>=22`.

No test framework. Quality bar = `npm run check` clean + manual smoke (Verification section).

No Prettier/ESLint config required. TypeScript strict mode is the enforcement.

---

## Repository layout

```
gusto/
├─ Dockerfile
├─ docker-compose.yml
├─ fly.toml
├─ .env.example
├─ .npmrc
├─ .gitignore
├─ LICENSE                              # MIT
├─ README.md
├─ SECURITY.md
├─ package.json
├─ svelte.config.js
├─ vite.config.ts
├─ tsconfig.json
├─ static/
│  ├─ fonts/Geist-Variable.woff2        # download from https://github.com/vercel/geist-font
│  ├─ icons/{icon-192.png,icon-512.png,icon-maskable-512.png}   # placeholder solid-color squares OK for v1
│  ├─ manifest.webmanifest
│  └─ robots.txt
├─ scripts/
│  └─ check-classify.ts                 # tiny tsx script asserting classifier behavior
├─ .github/workflows/
│  ├─ ci.yml                            # node 22, npm ci, npm run check
│  ├─ docker.yml                        # build & push image
│  └─ fly-deploy.yml                    # flyctl deploy on main
└─ src/
   ├─ app.css                           # Tailwind v4 + design tokens (full content below)
   ├─ app.html                          # theme init script + meta tags
   ├─ app.d.ts                          # App.Locals type
   ├─ hooks.server.ts                   # auth + headers + migrate
   ├─ lib/
   │  ├─ branding.ts                    # APP_NAME, APP_DOMAIN, APP_TAGLINE constants
   │  ├─ toasts.svelte.ts               # tiny rune-based toast store
   │  ├─ components/
   │  │  ├─ Toaster.svelte
   │  │  ├─ Landing.svelte
   │  │  ├─ ShortcutHelp.svelte
   │  │  ├─ CommandPalette.svelte       # cmd-k overlay
   │  │  ├─ EntityRow.svelte            # shared list row (avatar/logo, name, sub, actions)
   │  │  ├─ TagInput.svelte
   │  │  ├─ NotesEditor.svelte          # textarea -> sanitized HTML on save
   │  │  ├─ SaveBar.svelte              # topbar URL input
   │  │  └─ ThemeToggle.svelte
   │  └─ server/
   │     ├─ db.ts                       # libSQL client, region-aware
   │     ├─ schema.ts                   # Drizzle tables
   │     ├─ migrate.ts                  # raw SQL idempotent migrations + FTS5 triggers
   │     ├─ auth.ts                     # session, register, login, logout, reset
   │     ├─ rate-limit.ts               # in-memory sliding window
   │     ├─ sanitize.ts                 # sanitize-html allowlist
   │     ├─ url.ts                      # cleanUrl, assertPublicUrl, normalizeUrl
   │     ├─ classify.ts                 # URL → 'person' | 'company'
   │     ├─ og.ts                       # fetch + jsdom + OG/JSON-LD/favicon extraction
   │     ├─ savePerson.ts
   │     ├─ saveCompany.ts
   │     ├─ saveInteraction.ts
   │     └─ search.ts                   # FTS5 query helpers
   └─ routes/
      ├─ +layout.server.ts              # load user from locals
      ├─ +layout.svelte                 # app shell: topbar, sidebar, toaster
      ├─ +page.server.ts                # signed-out -> Landing; signed-in -> dashboard
      ├─ +page.svelte
      ├─ auth/
      │  ├─ +page.server.ts             # login/register actions
      │  ├─ +page.svelte
      │  ├─ forgot-password/+page.{server.ts,svelte}
      │  ├─ reset-password/[token]/+page.{server.ts,svelte}
      │  └─ logout/+server.ts
      ├─ people/
      │  ├─ +page.server.ts             # list with FTS, filters, pagination
      │  ├─ +page.svelte
      │  ├─ new/+page.{server.ts,svelte}
      │  └─ [id]/+page.{server.ts,svelte}
      ├─ companies/
      │  ├─ +page.{server.ts,svelte}
      │  ├─ new/+page.{server.ts,svelte}
      │  └─ [id]/+page.{server.ts,svelte}
      ├─ interactions/
      │  ├─ +page.{server.ts,svelte}
      │  ├─ new/+page.{server.ts,svelte}
      │  └─ [id]/+page.{server.ts,svelte}
      ├─ save/+page.{server.ts,svelte}  # share-target & bookmarklet landing
      ├─ settings/+page.{server.ts,svelte}
      ├─ health/+server.ts
      └─ api/
         ├─ save/+server.ts             # POST { url } -> { id, kind }
         ├─ people/+server.ts           # GET ?q=&limit= for typeahead
         ├─ people/[id]/+server.ts      # PATCH (whitelisted fields), DELETE
         ├─ companies/+server.ts, companies/[id]/+server.ts
         ├─ interactions/+server.ts, interactions/[id]/+server.ts
         ├─ interactions/[id]/people/+server.ts   # attach/detach
         ├─ tags/+server.ts, tags/[id]/+server.ts
         ├─ reminders/+server.ts, reminders/[id]/+server.ts
         ├─ user/+server.ts             # updateUsername, updateEmail, updatePassword, signOutOtherDevices
         └─ export/+server.ts           # CSV export
```

---

## Configuration files (full content)

### `svelte.config.js`
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const csp = {
  mode: 'auto',
  directives: {
    'default-src': ["'self'"],
    'script-src':  ["'self'"],                                 // SvelteKit injects nonces
    'style-src':   ["'self'", "'unsafe-inline'"],              // Tailwind utilities
    'img-src':     ["'self'", 'data:', 'https:'],              // og:image / favicons
    'font-src':    ["'self'"],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri':    ["'self'"],
    'form-action': ["'self'"]
  }
};

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter(), csp }
};
```

### `vite.config.ts`
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [tailwind(), sveltekit()] });
```

### `tsconfig.json`
```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true
  }
}
```

### `Dockerfile`
```dockerfile
# build
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# runtime
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "build"]
```

### `docker-compose.yml`
```yaml
services:
  gusto:
    build: .
    container_name: gusto
    restart: unless-stopped
    ports: ['3000:3000']
    environment:
      - NODE_ENV=production
      - ORIGIN=${ORIGIN:-http://localhost:3000}
      - DB_PATH=/app/data/gusto.db
      - DISABLE_REGISTRATION=${DISABLE_REGISTRATION:-}
    volumes:
      - gusto-data:/app/data
volumes:
  gusto-data:
```

### `fly.toml`
```toml
app = "gusto"            # rename if taken
primary_region = "ams"
[build]
[http_service]
  internal_port = 3000
  force_https = true
  auto_start_machines = true
  auto_stop_machines = true
  min_machines_running = 1
[[mounts]]
  source = "gusto_data"
  destination = "/app/data"
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

### `.env.example`
```
ORIGIN=http://localhost:3000
PORT=3000
DB_PATH=./data/gusto.db
# Optional remote libSQL (Turso) — leave blank to use the local file:
DATABASE_URL=
DATABASE_AUTH_TOKEN=
# Multi-region (advanced): set per-region URLs and the primary EU DB will hold the email-routing table
DATABASE_URL_EU=
DATABASE_URL_US=
DATABASE_URL_APAC=
# Set to "1" to disable new registrations after the first user is created
DISABLE_REGISTRATION=
```

### `app.html`
```html
<!doctype html>
<html lang="en" %sveltekit.theme%>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fafaf9" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#111110" />
    <link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />
    <link rel="icon" href="%sveltekit.assets%/icons/icon-192.png" />
    <script>
      // Run before render so there's no flash. Reads localStorage, falls back to system.
      try {
        const t = localStorage.getItem('theme');
        const d = t ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = d;
      } catch (_) {}
    </script>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

### `static/manifest.webmanifest`
```json
{
  "name": "Gusto",
  "short_name": "Gusto",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fafaf9",
  "theme_color": "#fafaf9",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "share_target": {
    "action": "/save",
    "method": "GET",
    "params": { "url": "url", "text": "text", "title": "title" }
  }
}
```

---

## Design system (copy verbatim into `src/app.css`)

This is the **only** design source of truth. Do not introduce a `tailwind.config.ts`.

```css
@import 'tailwindcss';
@plugin "@tailwindcss/typography";

@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
  font-style: normal;
}

@theme {
  --font-sans: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;

  --color-bg:               #fafaf9;
  --color-surface:          #ffffff;
  --color-border:           #e5e5e3;
  --color-border-strong:    #d4d4d1;
  --color-text:             #1c1c1a;
  --color-muted:            #78786e;
  --color-subtle:           #a8a89e;

  --color-danger:           #dc2626;
  --color-danger-bg:        #fef2f2;
  --color-danger-border:    #fca5a5;
  --color-success:          #16a34a;
  --color-success-bg:       #f0fdf4;
  --color-success-border:   #86efac;
  --color-warning:          #92400e;
  --color-warning-bg:       #fef3c7;
  --color-warning-border:   #fcd34d;
  --color-info:             #2563eb;
  --color-info-bg:          #eff6ff;
  --color-info-border:      #bfdbfe;
  --color-product:          #6d28d9;
  --color-product-bg:       #f5f3ff;
  --color-product-border:   #c4b5fd;

  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --shadow-md: 0 2px 8px 0 rgb(0 0 0 / 0.06), 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --shadow-lg: 0 8px 24px 0 rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.04);
}

[data-theme='dark'] {
  --color-bg:               #111110;
  --color-surface:          #1c1c1a;
  --color-border:           #2e2e2b;
  --color-border-strong:    #3d3d3a;
  --color-text:             #f5f5f0;
  --color-muted:            #a8a89e;
  --color-subtle:           #78786e;
  --color-danger:           #f87171;
  --color-danger-bg:        #2d1212;
  --color-danger-border:    #7f1d1d;
  --color-success:          #86efac;
  --color-success-bg:       #0e2a18;
  --color-success-border:   #166534;
  --color-warning:          #fbbf24;
  --color-warning-bg:       #271d06;
  --color-warning-border:   #78350f;
  --color-info:             #93c5fd;
  --color-info-bg:          #0d1f3c;
  --color-info-border:      #1e3a5f;
  --color-product:          #a78bfa;
  --color-product-bg:       #1e1030;
  --color-product-border:   #4c1d95;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.2);
  --shadow-md: 0 2px 8px 0 rgb(0 0 0 / 0.3), 0 1px 2px 0 rgb(0 0 0 / 0.2);
  --shadow-lg: 0 8px 24px 0 rgb(0 0 0 / 0.4), 0 2px 4px 0 rgb(0 0 0 / 0.2);
}

html, body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); }
button, input, select, textarea { font: inherit; color: inherit; }
*:focus-visible { outline: 2px solid var(--color-product); outline-offset: 2px; }
```

**App shell pattern** (in `src/routes/+layout.svelte`):
- Fixed topbar: brand mark + name (linked to `/`), `SaveBar` (URL input, full-width on desktop), search (icon → expands to input), `ThemeToggle`, settings menu.
- Left sidebar (collapsible on `<768px`): three primary tabs **People / Companies / Interactions** with counts. Below that: tag filter, archived/favorites filters, reminders.
- Main: scrollable content. Lists keyboard-nav with `j/k`, `enter` to open, `e` to edit, `#` to archive, `*` to favorite.
- Toaster mounted globally, fixed bottom-right.
- `?` opens `ShortcutHelp`. `cmd/ctrl-k` opens `CommandPalette`.

**Iconography**: every icon comes from `lucide-svelte`. Default size 16, strokeWidth 2.

**Motion**: 0.15s ease on hover/focus transitions; toasts slide-in 6px → 0 over 0.15s; auto-dismiss 3500ms (5500ms with undo button).

---

## Auth & sessions

- `users(id, email unique, passwordHash, username, createdAt)`.
- `sessions(id, userId, expiresAt)` — id format `"{region}:{cuid2}"` so a single cookie identifies the right regional DB without a routing lookup. For single-DB deployments use region `"local"`.
- Cookie: name `gusto_session`, `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`, 30-day expiry.
- `passwordResetTokens(token, userId, expiresAt, usedAt)` — 24h TTL, one-time.
- `emailRouting(email, region)` — populated in the **primary** DB (EU by default) for multi-region setups; ignored if not configured.

`src/lib/server/auth.ts` exports:
- `register({ email, password, username, region })` — email format check, password 8–72 chars, bcrypt 10 rounds, cuid2 user id, write to regional DB, write `(email, region)` to primary, create session.
- `login({ email, password })` — look up region in `emailRouting`, fetch user, bcrypt compare, create session.
- `validateSession(cookie)` — parse `region:id`, look up in regional DB, check expiry, return `{ user, session }` or `null`.
- `logout(sessionId)`, `logoutOthers(userId, currentSessionId)`.
- `requestPasswordReset(email)`, `consumeResetToken(token, newPassword)`.

Rate limits in `src/lib/server/rate-limit.ts` (sliding window in-memory `Map<key, number[]>`, cleanup when keys exceed 5000):
- Register: 5 / hour / IP
- Login: 10 / 15min / (IP + email)
- `/api/save`: 30 / 5min / user

**Bootstrap escape hatch**: even with `DISABLE_REGISTRATION=1`, allow registration when `users` table is empty so a fresh deploy can create its first owner.

`src/hooks.server.ts`:
```ts
import { initDb } from '$lib/server/db';
import { migrate } from '$lib/server/migrate';
import { validateSession } from '$lib/server/auth';

const ready = (async () => { await initDb(); await migrate(); })();

export const handle = async ({ event, resolve }) => {
  await ready;
  const cookie = event.cookies.get('gusto_session');
  event.locals.user = cookie ? (await validateSession(cookie))?.user ?? null : null;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html
  });

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
};
```

`src/app.d.ts`:
```ts
declare global {
  namespace App {
    interface Locals { user: { id: string; email: string; username: string | null; region: string } | null; }
  }
}
export {};
```

---

## Database & migrations

`src/lib/server/db.ts` exposes `initDb()`, `db(region?)`, `primaryDb()`. It:
- Reads `DATABASE_URL_*` for regional configs; falls back to `DATABASE_URL`; falls back to `file:${DB_PATH ?? './data/gusto.db'}` (creating the directory if missing).
- Caches one libSQL client per unique URL.
- For file URLs, sets PRAGMAs: `journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=-64000` (64MB), `mmap_size=268435456`, `temp_store=MEMORY`, `foreign_keys=ON`.
- Wraps each client in a Drizzle instance using `drizzle-orm/libsql`.

`src/lib/server/schema.ts`:
```ts
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: text('username'),
  createdAt: integer('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull()
}, t => ({ byUser: index('idx_sessions_user').on(t.userId) }));

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at')
});

export const emailRouting = sqliteTable('email_routing', {
  email: text('email').primaryKey(),
  region: text('region').notNull()
});

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url'),
  domain: text('domain'),
  description: text('description'),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  industry: text('industry'),
  location: text('location'),
  notes: text('notes'),
  isFavorite: integer('is_favorite').notNull().default(0),
  isArchived: integer('is_archived').notNull().default(0),
  source: text('source'),                      // 'parsing' | 'manual' | null
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, t => ({
  byUserArchived: index('idx_companies_user_arch').on(t.userId, t.isArchived),
  byUserFav:      index('idx_companies_user_fav').on(t.userId, t.isFavorite),
  byUserDomain:   index('idx_companies_user_domain').on(t.userId, t.domain),
  uniqUserUrl:    uniqueIndex('uq_companies_user_url').on(t.userId, t.url)
}));

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url'),
  domain: text('domain'),
  handle: text('handle'),
  role: text('role'),
  companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  avatarUrl: text('avatar_url'),
  faviconUrl: text('favicon_url'),
  notes: text('notes'),
  isFavorite: integer('is_favorite').notNull().default(0),
  isArchived: integer('is_archived').notNull().default(0),
  source: text('source'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, t => ({
  byUserArchived: index('idx_people_user_arch').on(t.userId, t.isArchived),
  byUserFav:      index('idx_people_user_fav').on(t.userId, t.isFavorite),
  byUserCompany:  index('idx_people_user_company').on(t.userId, t.companyId),
  byUserDomain:   index('idx_people_user_domain').on(t.userId, t.domain),
  uniqUserUrl:    uniqueIndex('uq_people_user_url').on(t.userId, t.url)
}));

export const interactions = sqliteTable('interactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  occurredAt: integer('occurred_at').notNull(),
  type: text('type').notNull(),                 // call|email|meeting|dm|event|note|other
  title: text('title').notNull(),
  body: text('body'),
  companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, t => ({
  byUserOccurred: index('idx_interactions_user_occurred').on(t.userId, t.occurredAt),
  byUserCompany:  index('idx_interactions_user_company').on(t.userId, t.companyId)
}));

export const interactionPeople = sqliteTable('interaction_people', {
  interactionId: text('interaction_id').notNull().references(() => interactions.id, { onDelete: 'cascade' }),
  personId:      text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' })
}, t => ({
  pk: primaryKey({ columns: [t.interactionId, t.personId] }),
  byPerson: index('idx_ip_person').on(t.personId)
}));

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  scope: text('scope').notNull()                // 'person' | 'company' | 'interaction'
}, t => ({ uniq: uniqueIndex('uq_tags_user_slug_scope').on(t.userId, t.slug, t.scope) }));

export const personTags      = sqliteTable('person_tags',      { personId: text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),      tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }) }, t => ({ pk: primaryKey({ columns: [t.personId, t.tagId] }) }));
export const companyTags     = sqliteTable('company_tags',     { companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }), tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }) }, t => ({ pk: primaryKey({ columns: [t.companyId, t.tagId] }) }));
export const interactionTags = sqliteTable('interaction_tags', { interactionId: text('interaction_id').notNull().references(() => interactions.id, { onDelete: 'cascade' }), tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }) }, t => ({ pk: primaryKey({ columns: [t.interactionId, t.tagId] }) }));

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                  // 'person' | 'company' | 'interaction'
  refId: text('ref_id').notNull(),
  remindAt: integer('remind_at').notNull(),
  createdAt: integer('created_at').notNull()
}, t => ({ byUserAt: index('idx_reminders_user_at').on(t.userId, t.remindAt) }));
```

`src/lib/server/migrate.ts` runs raw SQL in a single transaction at startup — every statement uses `CREATE … IF NOT EXISTS` (and column adds wrapped in try/catch) so it is idempotent. After the Drizzle-mirrored DDL, append:

```sql
-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS people_fts
  USING fts5(name, role, notes, location, content='people', content_rowid='rowid', tokenize='unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts
  USING fts5(name, description, notes, industry, location, content='companies', content_rowid='rowid', tokenize='unicode61');
CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts
  USING fts5(title, body, content='interactions', content_rowid='rowid', tokenize='unicode61');

-- Sync triggers (one set per FTS table)
CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, role, notes, location)
  VALUES (new.rowid, new.name, COALESCE(new.role,''), COALESCE(new.notes,''), COALESCE(new.location,''));
END;
CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, role, notes, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.role,''), COALESCE(old.notes,''), COALESCE(old.location,''));
END;
CREATE TRIGGER IF NOT EXISTS people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, role, notes, location)
  VALUES('delete', old.rowid, old.name, COALESCE(old.role,''), COALESCE(old.notes,''), COALESCE(old.location,''));
  INSERT INTO people_fts(rowid, name, role, notes, location)
  VALUES (new.rowid, new.name, COALESCE(new.role,''), COALESCE(new.notes,''), COALESCE(new.location,''));
END;
-- repeat for companies and interactions with their respective columns
```

A janitor at startup clears any rows where `source='parsing'` and `updatedAt < now-10min` (covers crashed enrichments).

---

## URL save & classify (the signature flow)

`src/lib/server/url.ts`:
- `cleanUrl(input)` — trim, prepend `https://` if missing scheme, parse with `new URL`, lower-case host, drop `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `_hsenc`, `_hsmi`, `vero_*`, `mkt_tok`, drop trailing slash on path, return canonical string. Throw on non-http(s).
- `assertPublicUrl(url)` — DNS-resolve host (or numeric parse); reject loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16, fe80::/10), private (10/8, 172.16-31/12, 192.168/16), unique-local (fc00::/7), and the literal `0.0.0.0`. SSRF guard.
- `domainOf(url)` — registered domain best-effort: strip `www.`.

`src/lib/server/classify.ts`:
```ts
export type Kind = 'person' | 'company';

const PERSON_HOST_PREFIXES: Array<{ host: string; pathStartsWith?: string }> = [
  { host: 'linkedin.com',          pathStartsWith: '/in/' },
  { host: 'linkedin.com',          pathStartsWith: '/pub/' },
  { host: 'x.com' },
  { host: 'twitter.com' },
  { host: 'github.com' },             // any path that's a single segment is a user; orgs handled by inspection
  { host: 'instagram.com' },
  { host: 'threads.net' },
  { host: 'bsky.app',              pathStartsWith: '/profile/' },
  { host: 'tiktok.com',            pathStartsWith: '/@' },
  { host: 'youtube.com',           pathStartsWith: '/@' },
  { host: 'medium.com',            pathStartsWith: '/@' },
  { host: 'substack.com',          pathStartsWith: '/@' },
  { host: 't.me' },
  { host: 'facebook.com' },
  { host: 'mastodon.social' },
  { host: 'about.me' },
  { host: 'read.cv' },
  { host: 'dribbble.com' },
  { host: 'behance.net' }
];

export function classify(url: URL): Kind {
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname || '/';
  for (const m of PERSON_HOST_PREFIXES) {
    const hostMatch = host === m.host || host.endsWith('.' + m.host);
    if (!hostMatch) continue;
    if (m.pathStartsWith && !path.startsWith(m.pathStartsWith)) continue;
    return 'person';
  }
  return 'company';
}

export function deriveHandle(url: URL): string | null {
  const m = url.pathname.match(/^\/(?:in|@|profile)?\/?([A-Za-z0-9_.\-]+)/);
  return m?.[1]?.replace(/^@/, '') ?? null;
}
```

`scripts/check-classify.ts` asserts the obvious cases: `linkedin.com/in/x → person`, `github.com/x → person`, `stripe.com → company`, `news.ycombinator.com → company`, `x.com/elonmusk → person`. Wire `tsx scripts/check-classify.ts` into `npm run check`.

`src/lib/server/og.ts` — tiny fetcher:
- `fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'GustoBot/1.0 (+https://gusto.sh)', 'Accept': 'text/html,application/xhtml+xml' } })`.
- `assertPublicUrl(url)` on the resolved redirect target before reading the body. Cap body read at 2 MB.
- Parse with `new JSDOM(html, { url })`. Read:
  - `og:title`, `og:description`, `og:image`, `og:site_name`, `og:url`
  - `<title>` and `<meta name="description">` as fallbacks
  - `<link rel="icon">`, `<link rel="apple-touch-icon">` — resolve to absolute URLs
  - `<script type="application/ld+json">` — first JSON parsed; if `@type==='Organization' || 'Person'`, harvest `name`, `image`, `worksFor.name`, `worksFor.url`.
- Returns `{ title, description, image, siteName, faviconUrl, jsonLd }`.

`src/lib/server/savePerson.ts`:
```ts
async function savePerson(userId: string, rawUrl: string | null, manual?: PersonInput) {
  const now = Date.now();
  const id = createId();
  if (rawUrl) {
    const url = new URL(cleanUrl(rawUrl));
    const existing = await db.select().from(people).where(and(eq(people.userId, userId), eq(people.url, url.toString()))).get();
    if (existing) return { id: existing.id, kind: 'person', dedup: true };
    await db.insert(people).values({
      id, userId,
      name: deriveHandle(url) ?? url.hostname,
      url: url.toString(),
      domain: domainOf(url),
      handle: deriveHandle(url),
      source: 'parsing',
      isFavorite: 0, isArchived: 0,
      createdAt: now, updatedAt: now
    });
    void enrichPerson(id, url, userId);     // fire-and-forget
  } else {
    await db.insert(people).values({ id, userId, ...manual!, source: 'manual', createdAt: now, updatedAt: now });
  }
  return { id, kind: 'person', dedup: false };
}

async function enrichPerson(id: string, url: URL, userId: string) {
  try {
    const og = await fetchOg(url);
    const cleanName = stripSiteSuffix(og.title);   // e.g. "Satya Nadella | LinkedIn" -> "Satya Nadella"
    await db.update(people).set({
      name: cleanName || /* keep stub */ undefined,
      avatarUrl: og.image ?? null,
      faviconUrl: og.faviconUrl ?? null,
      role: og.jsonLd?.jobTitle ?? null,
      notes: og.description ? sanitize(og.description) : null,
      source: null,
      updatedAt: Date.now()
    }).where(and(eq(people.id, id), eq(people.userId, userId)));

    const employerDomain = og.jsonLd?.worksFor?.url ? domainOf(new URL(og.jsonLd.worksFor.url)) : null;
    if (employerDomain) {
      const co = await db.select().from(companies).where(and(eq(companies.userId, userId), eq(companies.domain, employerDomain))).get();
      if (co) await db.update(people).set({ companyId: co.id }).where(eq(people.id, id));
    }
  } catch {
    await db.update(people).set({ source: null, updatedAt: Date.now() }).where(eq(people.id, id));
  }
}
```

`saveCompany.ts` is the same shape. `name = og.siteName || stripSiteSuffix(og.title) || domain`. `description = og.description`. `logoUrl = og.image || og.faviconUrl`.

`POST /api/save`:
```ts
export const POST = async ({ request, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  await checkRateLimit('save', locals.user.id);
  const { url } = await request.json();
  const u = new URL(cleanUrl(url));
  await assertPublicUrl(u);
  const kind = classify(u);
  const result = kind === 'person'
    ? await savePerson(locals.user.id, u.toString())
    : await saveCompany(locals.user.id, u.toString());
  return json({ id: result.id, kind, dedup: result.dedup });
};
```

The same handler powers the topbar `SaveBar.svelte`, the bookmarklet (`javascript:fetch('/api/save', { method:'POST', body: JSON.stringify({ url: location.href }), headers: { 'content-type':'application/json' }, credentials:'include' }).then(()=>alert('Saved to Gusto'))`), and the `/save?url=` PWA share-target (server route turns the GET into the same POST and redirects to the new entity's detail page).

---

## API contract — required endpoints

All endpoints check `locals.user`, scope queries by `userId`, sanitize HTML on write, whitelist updatable fields on PATCH.

| Method | Path | Body / Query | Notes |
|---|---|---|---|
| POST | `/api/save` | `{ url }` | classify → person/company |
| GET  | `/api/people` | `?q=&limit=&cursor=` | typeahead (FTS) |
| POST | `/api/people` | `PersonInput` (manual) | |
| PATCH | `/api/people/[id]` | partial; whitelist: `name,role,companyId,email,phone,location,notes,isFavorite,isArchived,avatarUrl` | |
| DELETE | `/api/people/[id]` | | hard delete (cascades) |
| GET/POST/PATCH/DELETE | `/api/companies[...]` | mirror people | |
| GET/POST/PATCH/DELETE | `/api/interactions[...]` | `InteractionInput { occurredAt, type, title, body, companyId }` | |
| POST | `/api/interactions/[id]/people` | `{ personId }` | |
| DELETE | `/api/interactions/[id]/people` | `{ personId }` | |
| POST/DELETE | `/api/tags[...]` | scope-aware | |
| POST | `/api/user` | `{ action: 'updateUsername'|'updateEmail'|'updatePassword'|'signOutOtherDevices', ... }` | |
| GET | `/api/export` | `?kind=people|companies|interactions` | streams CSV |
| GET | `/health` | | returns `200 ok` |

Form actions on the page routes mirror the API for progressive enhancement (no JS needed to use Gusto).

---

## UI specifics

**Landing (`Landing.svelte`)** — signed-out home:
- Hero: `clamp(2rem, 5vw, 3.375rem)` heading "A calmer CRM for the people you care about", eyebrow badge linking to GitHub, CTA buttons "Sign in" / "Sign up".
- Feature grid: 6 cards, 3 cols → 2 → 1: Open source, Self-hostable, No tracking, Save with one paste, People + Companies + Interactions, Keyboard-first.
- Footer: GitHub, security policy, license.

**Auth (`/auth`)** — split view:
- Left (≥768px): brand mark, four trust signals with Lucide icons (`Lock`, `Database`, `Zap`, `Sparkles`): "Open source", "Self-hostable", "No tracking", "One file backup".
- Right: tab toggle login/register, fields (email, password, username on register), submit. Below: "Forgot password?" link.

**Dashboard (`/`)** — signed-in root:
- "Recent interactions" timeline (last 14 days, max 10).
- "Recently saved" combined People+Companies (last 7 days, max 8).
- Counts strip: total people, total companies, interactions this month.

**`/people`** — list:
- Header: count, sort dropdown (recently added | name | last interaction), filter chips (favorites, archived, by company, by tag).
- Search bar binds to `?q=`. FTS5 query.
- Rows: `EntityRow` — avatar (or initials circle), name, sub line ("role at company · domain"), tags, right-aligned actions (favorite, archive, delete with undo).
- `j/k` keyboard nav, `enter` opens detail.

**`/people/[id]`** — detail:
- Header: avatar, name (inline-editable), role, company link, source URL, favorite/archive buttons.
- Side panel: email, phone, location, tags, "Linked company".
- Main: `NotesEditor` (textarea → sanitized HTML preview on blur), Interactions timeline scoped to this person, "+ Log interaction" CTA pre-filling person.
- Companion suggestion: if enrichment found a `worksFor` not yet linked → banner "Looks like {name} works at {employer}. Add as a company?".

**`/companies/[id]`** — same shape, plus a "People at this company" section listing linked people.

**`/interactions`** — chronological timeline grouped by day. Filters: by person, company, type, date range.

**`/interactions/new`**:
- Date/time picker (default = now), type select (`call/email/meeting/dm/event/note/other`), title (required), body (textarea, sanitized on save), people multi-select via typeahead against `/api/people?q=`, optional company select. "Save" + "Save & log another".

**`CommandPalette`** (`cmd/ctrl-k`): single overlay searching all three FTS tables in parallel; result rows tagged P/C/I. `↑↓` to nav, `enter` to open.

**Settings**: account (username/email/password), bookmarklet snippet, CSV export, sign out other devices, danger zone (delete all data).

---

## Phased build plan

Each phase ends at a green checkpoint. Do not move on until the checkpoint passes.

### Phase 0 — Bootstrap (skeleton only)
1. `git init`, write `package.json`, `.npmrc`, `.gitignore`, `tsconfig.json`, `svelte.config.js`, `vite.config.ts`, `app.html`, `app.css`, `app.d.ts` per the spec above.
2. Download `Geist-Variable.woff2` from the official Geist repo into `static/fonts/`.
3. `src/lib/branding.ts` exporting `APP_NAME='Gusto'`, `APP_DOMAIN='gusto.sh'`, `APP_TAGLINE='A calmer CRM for the people you care about'`, `BRAND_ACCENT='var(--color-product)'`.
4. Stub `src/routes/+layout.svelte` (just renders `{@render children()}` and `<Toaster/>`), `src/routes/+page.svelte` (placeholder "Hello, Gusto").
5. `npm i && npm run dev` — page boots, font loads, theme toggle stub works (manual `dataset.theme = 'dark'` in DevTools flips colors).
6. **Checkpoint**: `npm run check` clean; `localhost:5173` shows hello page in both themes.

### Phase 1 — Persistence & auth
1. Implement `src/lib/server/db.ts`, `schema.ts`, `migrate.ts` (with FTS triggers and indexes per spec), `auth.ts`, `rate-limit.ts`, `sanitize.ts`.
2. `hooks.server.ts` runs `initDb`+`migrate`, attaches `locals.user`.
3. `/auth` page with login/register form actions; `/auth/logout/+server.ts`; `/auth/forgot-password` and `/auth/reset-password/[token]`.
4. `+layout.svelte` shows brand mark + sign-in link when signed out; tab nav (People/Companies/Interactions) + user menu when signed in.
5. **Checkpoint**: register a user → redirected to `/`; restart server → still signed in; sign out → cookie cleared.

### Phase 2 — People & Companies
1. Implement `url.ts`, `classify.ts`, `og.ts`, `savePerson.ts`, `saveCompany.ts`, `POST /api/save`, `GET /api/people`, `GET /api/companies`.
2. `SaveBar.svelte` in topbar: paste → POST → toast "Saved" + invalidate.
3. `/people` and `/companies` list pages with FTS search, filter chips, keyboard nav (`j/k`, `enter`, `e`, `#`, `*`).
4. `/people/[id]` and `/companies/[id]` detail pages with inline name edit, notes editor (sanitized), favorite/archive, source URL, manual field edits via form actions.
5. `/people/new` and `/companies/new` for fully manual entries.
6. **Checkpoint**: paste `https://www.linkedin.com/in/satyanadella/` → person row appears within ~1s with handle, then enriched name + avatar within ~5s. Paste `https://stripe.com` → company row with logo. `/people?q=satya` returns the row. Re-paste either URL → no duplicate; toast says "Already saved".

### Phase 3 — Interactions
1. Schema is in place from Phase 1; verify FTS triggers run.
2. `/interactions/new` form with multi-person typeahead and optional company.
3. `/interactions/[id]` view + edit + delete (with undo toast).
4. `/interactions` timeline grouped by day; filters by person/company/type/date.
5. Render scoped timeline + "+ Log interaction" on `/people/[id]` and `/companies/[id]`.
6. **Checkpoint**: log an interaction with two people + a company. It appears on `/interactions`, both `/people/[id]`, and `/companies/[id]`. Editing `body` re-syncs FTS (verify by searching a unique word).

### Phase 4 — Search, tags, polish
1. Tags: `/api/tags`, inline `TagInput` on detail pages (scope-aware).
2. `CommandPalette.svelte` (`cmd-k`): unified search across the three FTS tables.
3. `ShortcutHelp.svelte` (`?`): list every shortcut.
4. Empty states for each tab (one-sentence prompt + single CTA).
5. Reminders: `/api/reminders` CRUD + sidebar popover sorted by `remindAt` ascending. (No delivery in v1.)
6. **Checkpoint**: `cmd-k` "stripe" returns the company; "satya" returns the person; the body of the interaction is searchable. Tags on a person filter the list.

### Phase 5 — Capture surfaces & data portability
1. Settings: bookmarklet snippet (auto-built from `APP_DOMAIN`), copy-to-clipboard.
2. `static/manifest.webmanifest` includes `share_target`. `/save?url=` route turns the GET into `POST /api/save` and redirects to the new entity's detail page (or back with a toast on dedup).
3. CSV export (`/api/export`) — streams a CSV per entity kind. (CSV import was scoped out of v1.)
4. **Checkpoint**: bookmarklet from a real LinkedIn page creates a person; iOS share-sheet → Gusto creates the right entity; CSV export downloads all rows for each kind and the columns round-trip on a re-import via spreadsheet.

### Phase 6 — Ship
1. README: pitch (private / lightweight / focused), screenshots placeholder, `docker compose up` quickstart, env var table, backup = `cp data/gusto.db backup.db`.
2. `SECURITY.md`: responsible disclosure, contact email, supported versions.
3. `LICENSE`: MIT.
4. GitHub Actions: `ci.yml` (Node 22 + `npm run check`), `docker.yml` (build + push to GHCR on tag), `fly-deploy.yml` (deploy on `main`).
5. Optional: domain `gusto.sh` → Fly app, Let's Encrypt cert.

---

## Verification — full smoke (run after Phase 5; gate before merge)

```bash
# Local dev
npm ci
npm run check                                  # types + svelte-check + tsx scripts/check-classify.ts
npm run dev                                    # http://localhost:5173

# Manual smoke (UI):
# 1. Register, sign in, theme toggle works in both directions, persists across reload.
# 2. Topbar paste https://www.linkedin.com/in/satyanadella/ -> person row in /people
#    within 1s; name/avatar fill within ~5s.
# 3. Topbar paste https://stripe.com -> company in /companies, with logo.
# 4. /interactions/new: log a meeting with the new person + Stripe; verify it
#    appears on /interactions, /people/[id], /companies/[id].
# 5. cmd-k "stripe" returns the company; "satya" returns the person; a unique
#    word from the interaction body returns the interaction.
# 6. Add a tag to the person; filter by that tag.
# 7. Archive the person -> hidden from default list; visible in archive filter.
#    Unarchive restores it.
# 8. Sign out, sign back in, all data persists.
# 9. Bookmarklet: from a github.com/<user> page, click bookmarklet -> person
#    created.
# 10. Stop dev: cp data/gusto.db /tmp/gusto-backup.db; rm -rf data; restore;
#    restart -> all data back.

# Container smoke
docker compose up --build
curl -fsS http://localhost:3000/health        # 200 ok
# repeat steps 1-10 against :3000
```

Passing all 10 steps in both `npm run dev` and the docker-compose container is the bar for **Gusto v1 done**.
