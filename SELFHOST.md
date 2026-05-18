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
- `.env` — your domain, a random `INBOUND_EMAIL_SECRET`, and commented-out
  optional knobs.
- `data/` — SQLite database and uploaded avatars. Survives restarts and
  upgrades.

Open `https://your.domain` in a browser and create your first account —
it becomes the admin.

## Customize

Edit `/srv/heli/.env`, then `cd /srv/heli && docker compose up -d`. Knobs:

| Variable               | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `PUBLIC_LOGODEV_KEY`   | Pretty company logos via [logo.dev](https://logo.dev) (free tier exists).          |
| `DISABLE_REGISTRATION` | Set to `1` after creating your admin account to block further sign-ups.            |
| `SQLITE_CACHE_MB`      | SQLite page cache, MB. Default `16`.                                                |
| `SQLITE_MMAP_MB`       | SQLite mmap window, MB. Default `64`.                                               |

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

## Troubleshooting

| Symptom                                  | Check                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| Installer warns "domain doesn't resolve" | Add the A record, then re-run the installer.                   |
| HTTPS times out at the end of install    | DNS not yet propagated, or firewall blocking 80/443.           |
| 502 from the domain                      | `docker compose -f /srv/heli/docker-compose.yml logs heli`.    |
| TLS error                                | `journalctl -u caddy -n 50 --no-pager`.                        |

## Don't want to self-host?

Use [heli.so](https://heli.so) — same software, hosted, free for solo use.
