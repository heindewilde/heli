<!-- TODO: drop logo file at docs/logo.svg (or .png). Recommended size: 120×120. -->
<!--
<p align="center">
  <img src="docs/logo.svg" alt="Heli" width="120" />
</p>
-->

<h1 align="center">Heli 🚁</h1>

<p align="center">
  <em>
    The CRM for freelancers and small businesses.<br>
    Private&nbsp;&nbsp;·&nbsp;&nbsp;
    Lightweight&nbsp;&nbsp;·&nbsp;&nbsp;
    Powerful&nbsp;&nbsp;·&nbsp;&nbsp;
    Beautifully-designed
  </em>
</p>

<p align="center">
  <a href="https://github.com/heindewilde/heli/actions/workflows/docker.yml"><img alt="CI" src="https://github.com/heindewilde/heli/actions/workflows/docker.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg"></a>
  <img alt="Built with SvelteKit" src="https://img.shields.io/badge/built%20with-SvelteKit-ff3e00?logo=svelte&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite&logoColor=white">
  <img alt="Docker ready" src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white">
</p>

<p align="center">
  <a href="#-self-hosting"><strong>Self-host in 5 minutes</strong></a>
  or
  <a href="https://heli.so/"><strong>try the hosted version →</strong></a>
</p>

<!--
Screenshot placeholders — drop files into docs/screenshots/ and uncomment:
  - dashboard.png    (people list, light mode, hero shot — 1600×1000+)
  - person.png       (person detail with interactions + links)
  - companies.png    (companies list with live brand logos)
  - pipelines.png    (pipeline board / Kanban with stages)
  - palette.png      (command palette with search results)
  - dark-mode.png    (dark theme showcase)
  - mobile.png       (mobile layout, portrait)
-->

<!--
<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Heli dashboard" width="880" />
</p>
-->

---

## Why Heli?

**Private by default.** Your contacts and the relationships between them shouldn't live on someone else's server. Heli runs entirely on hardware you control, with no tracking, no telemetry, and no third-party SDKs to sign in to. Your network never leaves your server.

**Lightweight and fast.** One small app, one database file — that's the whole stack. It boots in seconds, idles on almost nothing, and stays snappy with thousands of people, companies, and interactions in your library. Happy on a Raspberry Pi, a spare corner of your home server, or the cheapest VPS your provider sells.

**Powerful where it counts.** Most lightweight CRMs are pretty but thin. Heli ships the things you'd actually pay for: people and companies side-by-side, an interaction log that follows you everywhere, projects and pipelines with stages you can drag, smart enrichment that fills in details from a single URL, full-text search across the whole graph, tags, collections, statuses, reminders, and a command palette — all running locally against your own data.

**Beautifully designed.** A calm, distraction-free workspace, keyboard-first navigation, thoughtful typography, hand-tuned light and dark themes, and a mobile layout that actually works. Designed for the "slow CRM."

> **Private, lightweight, and fast — by design.** One process, one database file, one `curl … | sh`. No external services, no analytics, no heavy stack to maintain. Starts in seconds, happy on a 1 GB VPS.
> [Jump to self-hosting →](#-self-hosting)

---

## Heli in 30 seconds

<table>
<tr>
<td width="33%" valign="top">

### 📇 People & companies
Track individuals and organizations side by side. See who works where, who introduced whom, and what's been going on with each of them.

</td>
<td width="33%" valign="top">

### 💬 Log every interaction
Calls, emails, coffee chats, DMs — a running log of every touchpoint so nothing slips through the cracks.

</td>
<td width="33%" valign="top">

### 📋 Projects & pipelines
Group contacts into projects and move them through stages. Simple Kanban boards, no complexity tax.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### ⚡ Fast & lightweight
Boots in seconds, idles on almost nothing, runs on a 1 GB VPS. Fewer moving parts, fewer things to break.

</td>
<td width="33%" valign="top">

### 🔍 Search the whole graph
Full-text search across people, companies, interactions, projects, and notes. `⌘K` to jump anywhere.

</td>
<td width="33%" valign="top">

### 🔒 Own your data
One database file. Take a copy and walk away whenever. AGPL-3.0 — you have the right to study and modify every line.

### 👥 Work together
Invite colleagues into a shared workspace. Same records, three roles, private reminders.

</td>
</tr>
</table>

---

## Feature tour

### 📇 People & companies

<!-- TODO: docs/screenshots/person.png -->

- **Side-by-side primitives.** People and companies are first-class. Link a person to a company, see everyone who works there from the company page, and jump between the two with one click.
- **Rich profiles.** Photo or avatar, role, location, links (LinkedIn, website, GitHub, X, …), free-form notes, tags, and a custom status.
- **Live brand logos** for companies via [logo.dev](https://logo.dev) — set `PUBLIC_LOGODEV_KEY` to enable, leave blank to fall back to initials.
- **Inline-create rows.** Add a new person or company without leaving the list — start typing at the top of the table.
- **Filter by tag, status, or company.** Combine filters; the URL stays shareable so a filtered view is just a bookmark.
- **No duplicates.** Re-adding the same email, LinkedIn, or domain finds the existing record instead of making a new one.

### ✨ Smart enrichment & bookmarklet

<!-- TODO: docs/screenshots/save.png -->

- **Paste a URL, get a contact.** Drop a LinkedIn profile, a personal site, or a company homepage into the save box and Heli classifies it (person vs company) and fills in name, role, company, links, and a photo automatically.
- **Bookmarklet.** Drag the *Save to Heli* button from Settings to your bookmarks bar — saving any page becomes a one-click action that drops you into the new record. Same-origin only by design (it posts to `/api/save` with your session), so it works from any tab while you're signed in to Heli.
- **Tracking parameters removed** so shared links stay clean.
- **Background fetch.** Saves are instant; enrichment happens in the background and the record updates in place when it's done.

### 💬 Interactions

<!-- TODO: docs/screenshots/interactions.png -->

- **One running log** of every touchpoint — calls, emails, meetings, coffee chats, DMs, notes-to-self.
- **Attached where it matters.** Each interaction belongs to a person and optionally a company or project, so the same log shows up in all the right places.
- **Reminders per interaction.** Pin a follow-up to any interaction and Heli surfaces it when it's due.
- **Markdown-style notes** with safe HTML output (sanitized on write, not on read).

### 📋 Projects & pipelines

<!-- TODO: docs/screenshots/pipelines.png -->

- **Projects** group people, companies, and interactions under one umbrella with their own status, priority, and due date.
- **Pipelines** are Kanban boards — define stages once, drag items between them, and the pipeline tells you what's stuck and where.
- **Custom stages, custom statuses.** Per-pipeline stages; per-workspace statuses with colours you pick.
- **Priority flags** — low/medium/high/urgent — sort and filter every list view.

### 🏷️ Tags, collections & statuses

Three lightweight organisation primitives — use any or all.

|  | **Tags** | **Collections** | **Statuses** |
|---|---|---|---|
| **Purpose** | Flexible labels | Curated groups | Workflow state |
| **Creation** | Auto on first use | Explicit, you name them | Defined in Settings |
| **Renaming** | Merges on conflict | Simple rename | Edit anywhere it's used |
| **Where they apply** | Anything | People, companies, projects | Per entity type |

Plus built-in filters for **priority**, **due-soon**, **archive**, and **recently active**.

### 🔍 Full-text search & command palette

<!-- TODO: docs/screenshots/palette.png -->

- **Searches everything** — people, companies, interactions, projects, notes — including records you saved months ago.
- **`⌘K` / `Ctrl+K`** anywhere in the app opens the command palette.
- **Partial matches by default.** Type `acm` and find `Acme Corp` as well as `acmebank.com`.
- **Ranked by relevance**, not just date, and results arrive as you type (40 ms debounce; per-process LRU cache keeps repeats instant).
- **Server-side FTS5** — no external search engine to run, no separate index to maintain.

### 👥 Shared workspaces

- **Invite your colleagues by email** — or copy the invite link, which works even on a self-host with no mail configured.
- **Everyone in a workspace shares the same records**: people, companies, projects, pipelines, tags and statuses. Reminders stay private to each person.
- **Three roles.** Owners and admins manage the team and the workspace-wide destructive actions (imports, deleting a shared status or tag, deleting a pipeline). Members get full day-to-day CRM work.
- **Ownership is transferable**, and members can leave. Records created by someone who leaves stay with the workspace.
- **Belong to more than one workspace** and switch from the header — your own, plus any you've been invited to.

### 🔔 Reminders

- Pick any future datetime (defaults to tomorrow 9 am). Attach to a person, company, project, or interaction.
- The bell icon shows a dot when any reminder is due within 24 hours.
- Upcoming reminders live in the sidebar, sorted by time, with click-to-cancel and a generous undo window.

> Reminders are stored today; delivery via email/push is on the [roadmap](#-roadmap).

### ⚡ Fast & lightweight

- **Boots in seconds.** No warm-up, no background sync jobs, no dashboards to load.
- **Tiny footprint.** One small container, one SQLite file. Happy on a Raspberry Pi or the smallest VPS your provider sells.
- **Optimistic UI.** Toggling a status, editing a note, or moving a card in a pipeline updates the screen immediately and rolls back if the server disagrees.
- **Streaming SSR.** Layout HTML ships before secondary data resolves — first paint doesn't wait for the slowest query.
- **No moving parts.** No external database, no Redis, no message queue. Fewer things to configure, fewer things to break, fewer things to update.
- **Tunable for tight hosts.** `SQLITE_CACHE_MB` and `SQLITE_MMAP_MB` let you shrink memory for a 1 GB box or grow it on a beefier server.
- **Grows with your network.** Designed to stay fast as your graph grows into the tens of thousands.

### 📤 Export your data

- **CSV export** at `/api/export` — your whole library in a portable format, any time.
- **Plus the raw SQLite file** as the ultimate escape hatch. Open it in [DB Browser for SQLite](https://sqlitebrowser.org/), query it from any SQLite client, or migrate it to a different tool. No lock-in by design.

### ⌨️ Keyboard-first

Heli is built for people who prefer their hands on the keyboard. Navigate lists with `j`/`k`, open with `Enter`, search with `/`, open the command palette with `⌘K`, toggle status, jump between sections, and dismiss menus — all without reaching for the mouse. Hit `?` anywhere in the app to see every available shortcut.

### 📱 Mobile & PWA

<!-- TODO: docs/screenshots/mobile.png -->

Works beautifully on phones, tablets, and desktops. Heli ships as a **Progressive Web App** — add it to your home screen from any browser for a full-screen, app-like experience on iOS and Android, no app store required. Once installed, Heli appears in your device's share sheet — save anyone from any app with one tap.

### 🌙 Dark mode

<!-- TODO: docs/screenshots/dark-mode.png -->

Both light and dark themes are carefully tuned for long sessions in a CRM. Toggle with one click; your preference is remembered across sessions.

---

## How Heli compares

|  | **Heli** | **HubSpot / Salesforce** | **Notion / spreadsheet** |
|---|---|---|---|
| **Setup** | 5 min, one VPS | Sales call, weeks of config | Minutes — but you're building from scratch |
| **Cost** | Free (self-host) · free for solo on heli.so | $$$/seat/month | Free–$$ |
| **Footprint** | One process, one file | SaaS-only | SaaS-only |
| **Relationship graph** | Native (people ↔ companies ↔ projects) | Yes, but heavy | You build it manually |
| **Pipelines** | Yes, lightweight | Yes, sprawling | You build it manually |
| **Collaboration** | Shared workspaces, roles, private reminders | Yes, per seat | Shared doc, no roles |
| **Privacy** | Your server, your data | Their server | Their server |
| **Lock-in** | None — SQLite file you own | High | Medium |
| **Best for** | Freelancers & small teams who want a CRM that gets out of the way | Enterprise sales orgs | "I'll just track this in a spreadsheet" people |

---

## Two ways to use Heli

|  | **☁️ Cloud (heli.so)** | **🏠 Self-host** |
|---|---|---|
| **Setup** | Sign up — zero config | One-line installer, 5 minutes |
| **Storage** | Managed, encrypted | Your database file |
| **Updates** | Automatic | Automatic (Watchtower) — or manual |
| **Backups** | Automated, offsite | Your cron, your volume |
| **Cost** | Free for solo during beta | Free (you pay for hosting) |
| **Privacy** | Hosted by us | Never leaves your server |
| **Best for** | "I just want a CRM." | "I want to own every byte." |

Both run the exact same open-source code.

---

## ☁️ Cloud — heli.so

Heli is available as a managed service at **[heli.so](https://heli.so/)**.

**What you get:**
- Everything in this README, zero setup
- Managed updates and security patches
- Automated offsite backups
- Same AGPL-3.0 code, just hosted for you
- Free for solo use during beta

**[Get started →](https://heli.so/)**

---

## 🏠 Self-hosting

Heli runs as a **single process** with a **single database file**. No database server, no Redis, no queue, no external dependencies beyond Node. That's what makes it lightweight enough to self-host comfortably on modest hardware.

### Option A — One-line installer (recommended)

SSH into any Linux VPS with a public IP and run:

```bash
curl -sSL https://heli.so/install | sh
```

The installer asks for two things:

1. The **domain** you want Heli on (e.g. `crm.example.com`) — must already point at this server via a DNS A record.
2. An **email** for Let's Encrypt renewal notices.

Then it installs Docker, installs Caddy, generates secrets, pulls the Heli image, configures HTTPS, and waits until `https://your.domain` is serving. Total time: ~3 minutes on a fresh VPS.

**Recommended host:** [Hetzner CPX22](https://www.hetzner.com/cloud) (Ubuntu 24.04, ~€7/mo, 2 vCPU, 4 GB RAM). Anything with ≥ 1 GB RAM works.

Full guide, including Cloudflare, performance tuning, and Resend email setup: [SELFHOST.md](./SELFHOST.md).

### Option B — Docker Compose

**Requirements:** Docker 20+ with Compose v2.

```bash
git clone https://github.com/heindewilde/heli.git
cd heli
cp .env.example .env
```

Open `.env` and set `ORIGIN` to the public URL you'll serve from (required in production):

```env
ORIGIN=https://crm.yourdomain.com
```

Start it:

```bash
docker compose up -d
```

That's it. Heli is running on port **3000**. Data lives in `./data` (SQLite file + uploaded avatars) and survives restarts and upgrades. A bundled **Watchtower** sidecar checks GHCR every 6 hours and rolls Heli to the latest image automatically — comment out the `watchtower:` service in `docker-compose.yml` to disable.

**Change the port:** edit the `ports:` mapping in `docker-compose.yml`. Remember to update `ORIGIN` to match.

### Option C — Docker run (no Compose)

Prebuilt multi-arch images (`amd64` + `arm64`) are published to GitHub Container Registry on every push to `main`:

```bash
docker run -d --name heli -p 3000:3000 \
  -v heli-data:/data \
  -e ORIGIN=http://localhost:3000 \
  -e DB_PATH=/data/heli.db \
  -e AVATARS_DIR=/data/avatars \
  ghcr.io/heindewilde/heli:stable
```

Pin to a specific release by replacing `:stable` with `:1.2.3`. To build from source instead, clone the repo and run `docker build -t heli .`.

### Option D — Node.js (from source)

**Requirements:** Node.js 22+ (per `package.json` engines).

```bash
git clone https://github.com/heindewilde/heli.git
cd heli
npm ci
npm run build
PORT=3000 ORIGIN=http://localhost:3000 node build
```

`PORT` and `ORIGIN` must match — `PORT` is what the server listens on, `ORIGIN` is the URL your browser uses. Data is written to `./data/heli.db` by default (override with `DB_PATH`).

To run as a service, wrap `node build` with systemd, pm2, or your supervisor of choice.

### Upgrading

The bundled Watchtower service rolls the container automatically when a new image is published. If you'd rather pin and upgrade manually, comment out `watchtower:` in `docker-compose.yml` and run:

```bash
cd /srv/heli
docker compose pull && docker compose up -d
```

Schema migrations are applied automatically at startup. Your data is untouched during upgrades.

### Backups

The whole app lives in `data/heli.db` plus `data/avatars/`. Back them up however you'd back up any SQLite file.

**Live backup (no downtime):**

```bash
cd /srv/heli
docker compose exec heli sqlite3 /data/heli.db ".backup /data/backup-$(date +%F).db"
tar czf backup-$(date +%F)-avatars.tgz -C data avatars
```

**Daily cron:**

```cron
0 3 * * * cd /srv/heli && docker compose exec -T heli sqlite3 /data/heli.db ".backup /data/backup-$(date +\%F).db"
```

**Offsite:** pipe to `restic`, `rclone`, or `rsync` to your destination of choice.

### Reverse proxy

Point your proxy at port 3000, forward `Host` and `X-Forwarded-*` headers, and set `ORIGIN` to your public URL.

If you're behind a proxy and want the auth rate limiter to see real client IPs (rather than the proxy's IP), also set `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1` on the Heli container. Increase `XFF_DEPTH` if you have more than one proxy hop.

<details>
<summary><strong>Caddy</strong></summary>

```caddy
crm.yourdomain.com {
    encode zstd br gzip
    reverse_proxy localhost:3000
}
```

</details>

<details>
<summary><strong>nginx</strong></summary>

```nginx
server {
    listen 443 ssl http2;
    server_name crm.yourdomain.com;

    # SSL config (certbot, Let's Encrypt, etc.)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

</details>

<details>
<summary><strong>Traefik (labels on docker-compose)</strong></summary>

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.heli.rule=Host(`crm.yourdomain.com`)"
  - "traefik.http.routers.heli.entrypoints=websecure"
  - "traefik.http.routers.heli.tls.certresolver=letsencrypt"
  - "traefik.http.services.heli.loadbalancer.server.port=3000"
```

</details>

---

## ⚙️ Configuration

All configuration is via environment variables (or a `.env` file).

| Variable | Default | Required? | Description |
|---|---|---|---|
| `ORIGIN` | `http://localhost:3000` | **Yes in production** | Public URL the app is served from. Must match the domain users hit. |
| `PORT` | `3000` | No | Port the Node server listens on. |
| `DB_PATH` | `./data/heli.db` | No | Path to the SQLite database file (local file mode). |
| `DATABASE_URL` | — | No | Remote libSQL / Turso URL. Overrides `DB_PATH` when set. |
| `DATABASE_AUTH_TOKEN` | — | No | Auth token for remote libSQL. Required when `DATABASE_URL` points to a remote instance. |
| `DATABASE_URL_EU` / `_US` / `_APAC` | — | No | Per-region libSQL replicas for advanced multi-region setups. Writes go to `PRIMARY_REGION`. |
| `ADMIN_SECRET` | — | No | Shared secret required to call `GET /api/admin/stats`. Set to any strong random string. |
| `DISABLE_REGISTRATION` | — | No | Set to `1` to block new sign-ups. The first account can always be created so you can bootstrap your own instance with this already on. |
| `INBOUND_EMAIL_SECRET` | — | No | 32-byte hex shared secret for the `/api/inbound-email` webhook. Optional — see note below. |
| `SQLITE_CACHE_MB` | `16` | No | SQLite page-cache size. Raise on bigger boxes for more in-memory query hits. |
| `SQLITE_MMAP_MB` | `64` | No | SQLite mmap window. Raise on bigger boxes. |
| `PUBLIC_LOGODEV_KEY` | — | No | [logo.dev](https://logo.dev) publishable token for live company brand logos. Leave blank to fall back to initials. |
| `RESEND_API_KEY` | — | No | Required for password-reset email delivery. Without it, reset links print to the container logs. |
| `EMAIL_FROM` | `Heli <noreply@heli.so>` | No | Override the From address used for outbound mail. |

**Advanced — inbound email.** Heli exposes `/api/inbound-email` for posting parsed inbound payloads (newsletters, replies, anything you'd like attributed to a user as an interaction). Set `INBOUND_EMAIL_SECRET` to a long random string (e.g. `openssl rand -hex 32`) and point your inbound-email provider's webhook at `https://your.domain/api/inbound-email?secret=<that-value>`. A provider-specific walkthrough is on the [roadmap](#-roadmap).

---

## 🏗️ Architecture at a glance

For the technically curious:

- **Single-process SvelteKit app**, server-rendered with `adapter-node`. No separate API, no microservices.
- **One SQLite file** for everything via libSQL. Local by default; remote Turso supported if you want it.
- **Full-text search lives inside SQLite** (FTS5) — no separate search engine to run or maintain.
- **Optimistic list cache + service worker** on the client; streaming SSR for layout-level data that shouldn't gate first paint.
- **Multi-region** via Turso replicas + an `email_routing` table; a single `PRIMARY_REGION` handles writes, replicas serve reads near each user.
- **Background enrichment.** Saves return instantly; URL parsing, logo fetches, and classifications run in the background and the record updates in place.
- **Startup janitor** clears `source='parsing'` rows that were stuck mid-fetch when the process died.
- **Session auth** with bcrypt-hashed passwords and httpOnly cookies. Every user's library is fully isolated.

---

## 🧰 Tech stack

- **[SvelteKit 2](https://kit.svelte.dev)** + **[Svelte 5](https://svelte.dev)** (runes)
- **[Drizzle ORM](https://orm.drizzle.team)** + **[@libsql/client](https://github.com/tursodatabase/libsql-client-ts)** (SQLite / Turso)
- **[node-html-parser](https://github.com/taoqf/node-html-parser)** — fast, dependency-light HTML parsing for enrichment (deliberately not jsdom)
- **[Tailwind CSS v4](https://tailwindcss.com)** + **[@tailwindcss/typography](https://github.com/tailwindlabs/tailwindcss-typography)**
- **[lucide-svelte](https://lucide.dev)** — icons (pinned to `0.577.0`)
- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js)** — password hashing
- **[CUID2](https://github.com/paralleldrive/cuid2)** — primary keys
- **[sanitize-html](https://github.com/apostrophecms/sanitize-html)** — notes are sanitized on write, never on read
- Optional: **[Resend](https://resend.com)** for transactional email, **[logo.dev](https://logo.dev)** for live company brand logos

---

## 🗺️ Roadmap

Not promises — a rough direction. Open an issue to vote or propose changes.

- **Server-side reminder delivery** (email + push).
- **Inbound-email provider guide** — Postmark / SES / Mailgun walkthroughs.
- **More importers** — HubSpot CSV, Notion DB exports, vCard, Google Contacts.
- **Two-way calendar & email integrations** — pull meetings and messages into the interaction log automatically.
- **Native mobile shell** — wrapping the PWA for App Store / Play Store distribution.

---

## 🤝 Contributing

**PRs, issues, and discussions are all welcome.** Heli is a small project and a friendly one — come as you are.

**Quickstart:**

```bash
git clone https://github.com/heindewilde/heli.git
cd heli
npm install
npm run dev          # dev server on port 5173
```

Before opening a PR:

```bash
npm run check        # type-check with svelte-check + the classification linter — the primary correctness signal
```

There's no test suite yet; `npm run check` is what CI would run, and the quality bar is **0 errors / 0 warnings**.

**Conventions:**
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) — no legacy Options API.
- Scoped `<style>` blocks with CSS custom properties — no Tailwind utility classes in component markup.
- `lucide-svelte@0.577.0` for icons (specific version pinned — newer versions break Svelte 5 stable).
- New `dependencies` (not devDependencies) need to justify their footprint — Heli is meant to stay lean enough to self-host on a 1 GB VPS.

**Where to start:**
- Browse [good-first-issue](https://github.com/heindewilde/heli/labels/good%20first%20issue) labels.
- Join [Discussions](https://github.com/heindewilde/heli/discussions) for design questions.
- Anything on the roadmap is fair game — say hi on the relevant issue before starting large work.

---

## ❓ FAQ

**Why another CRM?**
Because the good ones are either enterprise SaaS (HubSpot, Salesforce) priced per seat per month, or "Notion with a contacts database" that you have to build and maintain yourself, or a spreadsheet that doesn't model relationships at all. Heli aims for the middle: real CRM primitives — people, companies, interactions, projects, pipelines — without the subscription, without the data surrender, in a package light enough to run on a Pi.

**How does it compare to HubSpot / Salesforce / Notion?**
See the [comparison table](#how-heli-compares) above. Roughly: Heli is feature-par on the CRM essentials (contacts, companies, deals, activity log, pipelines), but cheaper, lighter, and yours. It's not trying to be a marketing-automation suite — if you need lead-scoring, multi-touch attribution, and a sales-ops team, HubSpot is what you want.

**Can I run this on a Raspberry Pi?**
Yes. A Pi 4 with 2 GB RAM handles a single-user library of thousands of records comfortably. The Docker image runs on both `arm64` and `amd64`.

**Is my data truly private?**
Yes, with one nuance. Heli only reaches out to the internet for three things: (1) fetching pages you ask it to enrich, (2) fetching favicons and avatar/logo images those pages reference, and (3) if you set `PUBLIC_LOGODEV_KEY`, fetching company brand logos via [logo.dev](https://logo.dev). No telemetry, no analytics, no third-party SDKs. Leave the logo.dev key blank and the only outbound traffic is to URLs you explicitly save.

**Can I import my existing CRM data?**
CSV is supported today. Native importers for HubSpot, Notion, and vCard are on the [roadmap](#-roadmap). In the meantime, most exports can be massaged into the CSV schema with a spreadsheet or a few lines of `awk`.

**Does it work offline?**
The app shell, your most recent lists, and avatars are served from the service worker, so the UI loads and lets you browse what you've already seen. Saves, search, and enrichment need network access.

**What happens to my data if I stop self-hosting?**
You have the database file. It's a plain SQLite database — open it in [DB Browser for SQLite](https://sqlitebrowser.org/), query it from any SQLite client, or export to CSV via `/api/export`. No lock-in by design.

---

## 🙏 Acknowledgements

- **[SvelteKit](https://kit.svelte.dev)** and **[Drizzle](https://orm.drizzle.team)** teams for building tools that make small projects feel powerful.
- **[Turso / libSQL](https://turso.tech)** for taking SQLite seriously as a production database.
- **[lucide](https://lucide.dev)** for icons that look good at any size.
- **[logo.dev](https://logo.dev)** for the brand-logo API that makes company lists look alive.
- **[Resend](https://resend.com)** for a transactional-email service that's a pleasure to integrate.
- **[Caddy](https://caddyserver.com)** and **[Watchtower](https://containrrr.dev/watchtower/)** — half of what makes the one-line installer feel magic.
- Everyone who self-hosts, files issues, and keeps the open web open.

---

## 📜 License

**AGPL-3.0.** See [`LICENSE`](LICENSE) for the full text.

In plain English:
- You can **run** Heli on your own server, for yourself or your family or your company, forever, for free.
- You can **modify** the source code however you like.
- If you **offer modified Heli as a network service to others** (i.e. you build a paid hosted version), you must publish your modifications under AGPL-3.0 too.

This is deliberate — Heli is and will remain open. If AGPL concerns you and you'd like different terms, open a discussion.
