# Self-hosting Heli

```bash
ssh root@your-vps
curl -sSL https://heli.so/install | sh
```

The installer asks for two things:

1. The **domain** you want Heli on (e.g. `crm.example.com`) — must already
   point at this server via a DNS A record.
2. An **email** for Let's Encrypt renewal notices.

Then it installs Docker, installs Caddy, generates secrets, pulls the
Heli image, configures HTTPS, and waits until `https://your.domain` is
serving. Total time: ~3 minutes on a fresh VPS.

## What you need

- A small Linux VPS with a public IP. Recommended: **Hetzner CPX22**
  (Ubuntu 24.04, ~€7/mo, 2 vCPU, 4 GB RAM). Anything with ≥ 1 GB RAM
  works.
- A domain you control, with an **A record** pointing at the VPS:
  | Type | Host | Value             | TTL   |
  | ---- | ---- | ----------------- | ----- |
  | A    | crm  | `<your-vps-ipv4>` | 5 min |

## After install

The installer creates `/srv/heli/` with:

- `docker-compose.yml` — pulled from the public repo, pinned to the
  latest stable image.
- `.env` — your domain and commented-out optional knobs.
- `data/` — SQLite database and uploaded avatars. Survives restarts and
  upgrades.

Open `https://your.domain` in a browser and create your first account —
it becomes the admin.

## Customize

Edit `/srv/heli/.env`, then `cd /srv/heli && docker compose up -d`. Knobs:

| Variable               | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `PUBLIC_LOGODEV_KEY`   | Pretty company logos via [logo.dev](https://logo.dev) (free tier exists).          |
| `ENABLE_REGISTRATION`  | Sign-ups close automatically once the first account exists. Set to `1` to reopen them. |
| `DISABLE_REGISTRATION` | Hard kill switch for sign-ups. Wins over `ENABLE_REGISTRATION`.                    |
| `SQLITE_CACHE_MB`      | SQLite page cache, MB. Default `16`.                                                |
| `SQLITE_MMAP_MB`       | SQLite mmap window, MB. Default `64`.                                               |
| `SCHEDULER_DISABLED`   | Set to `1` to stop the background calendar poller. See [Calendars](#calendars).    |
| `EXTENSION_ORIGINS`    | Origins allowed to call `/api/v1` cross-origin. See [Browser extension](#browser-extension). |

## Performance tuning

Heli is built to feel fast on cheap hardware. Out of the box, a 1 GB VPS
behind the installer-managed Caddy already gives you HTTP/3, TLS 1.3,
and per-asset cache headers. A few knobs to push it further:

### Geography

The single biggest perceived-speed lever is **distance**. If most of
your traffic is from one continent, pick a VPS in that continent.
- Hetzner has datacenters in Falkenstein/Nuremberg (EU), Ashburn (US-East), Hillsboro (US-West), and Singapore.
- DigitalOcean has 14+ regions.
- Vultr has 30+ regions including São Paulo, Sydney, Tokyo, Johannesburg.

### Compression and HTTP/3

The installer-managed Caddy serves HTTP/3 by default. To also enable
brotli compression (smaller responses than gzip for text), add `encode`
to `/etc/caddy/Caddyfile`:

```caddy
your.domain {
    encode zstd br gzip
    reverse_proxy localhost:3000
}
```

Then `sudo systemctl reload caddy`. Heli's Node server also gzips
responses on its own (so the origin → reverse-proxy hop is already
compressed); this just adds brotli for the proxy → browser hop.

### SQLite memory

The defaults assume a tight 1 GB VPS. If you have more RAM, give SQLite
more page cache and a wider mmap window — most read queries become
memory hits instead of disk reads:

```bash
# /srv/heli/.env, for hosts with ≥ 2 GB RAM
SQLITE_CACHE_MB=64
SQLITE_MMAP_MB=128
```

`docker compose up -d` to apply.

### Putting Cloudflare in front

For globally distributed users on a single VPS, a CDN in front buys you
TLS termination + edge caching near every visitor. Cloudflare's free
plan covers it:

1. Add your domain to Cloudflare, set DNS to Cloudflare nameservers.
2. Point the A record at your VPS as before, but with the **orange
   cloud** enabled.
3. SSL/TLS mode: **Full (strict)** (Caddy already has a real cert).
4. Optional cache rule: `/_app/immutable/*` and `/avatars/*` → "Cache
   Everything", edge TTL 1 year. Heli already sends immutable headers
   on those paths; the rule just opts them into Cloudflare's edge.

The HTML for authed pages stays uncached (private cookies) — only
static assets ride the edge.

If you don't want a public IP at all, **Cloudflare Tunnel** is the same
benefits without exposing your VPS: `cloudflared tunnel create heli`,
point the tunnel at `localhost:80`, route the hostname.

## Upgrade

Updates are applied **automatically** — a Watchtower sidecar checks
GHCR every 6 hours and rolls the Heli container when a new image is
published. There's nothing to do.

If you'd rather upgrade manually, comment out the `watchtower` service
in `docker-compose.yml` and run this when you want a new version:

```bash
cd /srv/heli && docker compose pull && docker compose up -d
```

To pin to a specific version (never auto-upgrade past it), edit
`docker-compose.yml` and replace `:latest` with `:1.0.0` (or any tag
from https://github.com/heindewilde/heli/pkgs/container/heli).

## Backup

```bash
cd /srv/heli
docker compose exec heli sqlite3 /data/heli.db ".backup /data/backup-$(date +%F).db"
tar czf backup-$(date +%F)-avatars.tgz -C data avatars
```

Rsync the resulting files off-box (S3, another VPS, your laptop) on
whatever schedule fits.

## Restore

Stop Heli, swap the file in, start Heli:

```bash
cd /srv/heli
docker compose down
cp /path/to/backup-YYYY-MM-DD.db data/heli.db
tar xzf /path/to/backup-YYYY-MM-DD-avatars.tgz -C data
docker compose up -d
```

Test the restore on a throwaway box at least once before you need it.

## Calendars

Heli can subscribe to a calendar feed and turn meetings into interactions,
linked to people you already have. There is no account to connect — every
calendar app exposes a private `.ics` URL:

- **Google** — Settings → click the calendar → *Secret address in iCal format*
- **Apple** — right-click the calendar → Share Calendar → Public Calendar
- **Fastmail** — Calendar → ⋯ → Export / Subscribe
- **Outlook** — Settings → Shared calendars → Publish, then copy the ICS link

Paste it under **Settings → Calendars**. That URL is a password: anyone holding
it can read your calendar. Heli stores it, never shows it again, and keeps it
out of exports.

A background scheduler polls each feed at most every 15 minutes. It runs inside
the app — no extra container, no cron. To turn it off and drive syncs yourself:

```bash
SCHEDULER_DISABLED=1
```

## Browser extension

The extension saves the page you're on — including pages the server can't fetch
itself, like LinkedIn profiles behind a sign-up wall. It authenticates with a
personal access token (**Settings → Personal access tokens**, `capture` scope),
because the session cookie is `SameSite=Lax` and is never sent from an
extension.

If you build and load it yourself, allow its origin:

```bash
EXTENSION_ORIGINS=chrome-extension://<your-extension-id>
```

Heli never sends `Access-Control-Allow-Credentials`, so an entry here cannot be
used to ride someone's session — the only way in is a token they created.

## Email (password resets, invites)

By default, password-reset links only print to the container logs.
Wire up [Resend](https://resend.com) (free tier: 3000 emails/mo) to
actually deliver them. Add to `/srv/heli/.env`:

```bash
RESEND_API_KEY=re_xxx
EMAIL_FROM=Heli <hello@yourdomain.com>   # must be a verified Resend sender
```

Then `cd /srv/heli && docker compose up -d` to pick them up.

If you're locked out and haven't set up email, get a reset link by
tailing the container while triggering "Forgot password":

```bash
docker compose logs -f heli | grep -i reset
```

## Registration

Once your admin account exists, **registration is closed by default**
on a self-host. To allow new accounts (e.g. for a small team), add to
`.env`:

```bash
ENABLE_REGISTRATION=1
```

To hard-disable even the first-user bootstrap (e.g. on a sealed install)
set `DISABLE_REGISTRATION=1` — that overrides everything.

## Troubleshooting

| Symptom                                  | Check                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| Installer warns "domain doesn't resolve" | Add the A record, then re-run the installer.                   |
| HTTPS times out at the end of install    | DNS not yet propagated, or firewall blocking 80/443.           |
| 502 from the domain                      | `docker compose -f /srv/heli/docker-compose.yml logs heli`.    |
| TLS error                                | `journalctl -u caddy -n 50 --no-pager`.                        |

## Don't want to self-host?

Use [heli.so](https://heli.so) — same software, hosted, free for solo use.
