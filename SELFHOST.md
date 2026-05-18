# Self-hosting Heli

Heli runs as a single Docker container against a local SQLite file. It
comfortably fits on a 2 GB VPS (~€5/mo) and needs nothing beyond Docker
and a reverse proxy. This guide takes you from zero to `https://your.domain`
in about 15 minutes.

## What you need

- A domain you control (e.g. `crm.example.com`).
- A small Linux VPS with a public IP. Recommended: **Hetzner CPX22**
  (Ubuntu 24.04, ~€7/mo, 2 vCPU, 4 GB RAM). Anything with ≥ 1 GB RAM
  works.
- SSH access to that VPS as `root` (or any user with `sudo`).

That's it. No managed database, no S3, no Redis.

## 1. Point DNS at the VPS

At your DNS provider, add an **A record**:

| Type | Host | Value             | TTL   |
| ---- | ---- | ----------------- | ----- |
| A    | crm  | `<your-vps-ipv4>` | 5 min |

(Use whatever subdomain you like — examples below assume `crm.example.com`.)

## 2. Install Docker and Caddy on the VPS

SSH in and run:

```bash
ssh root@your-vps-ip

# Docker
curl -fsSL https://get.docker.com | sh

# Caddy (handles HTTPS automatically via Let's Encrypt)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy ufw fail2ban

# Firewall
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
```

## 3. Run Heli

Still on the VPS:

```bash
# Clone the repo (Dockerfile and docker-compose.yml live here)
git clone --depth 1 https://github.com/heindewilde/heli.git /srv/heli
cd /srv/heli

# Create your .env (replace crm.example.com with your domain)
cat > .env <<EOF
ORIGIN=https://crm.example.com
INBOUND_EMAIL_SECRET=$(openssl rand -hex 32)
EOF

# Build and start
docker compose up -d --build
```

That's it. The database and uploaded avatars live in `/srv/heli/data/`
(created automatically on first start) and persist across restarts and
upgrades.

### Optional `.env` settings

| Variable               | What it does                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `PUBLIC_LOGODEV_KEY`   | Pretty company logos via [logo.dev](https://logo.dev). Free tier exists. Falls back to OG / initials. |
| `DISABLE_REGISTRATION` | Set to `1` after creating your admin account to block further sign-ups.                            |
| `SQLITE_CACHE_MB`      | SQLite page cache, MB. Default `16`. Lower for tiny VPSes.                                          |
| `SQLITE_MMAP_MB`       | SQLite mmap window, MB. Default `64`. Same.                                                         |

Add them on their own lines in `.env` and run `docker compose up -d` again
to pick up changes.

## 4. Configure Caddy

Replace `/etc/caddy/Caddyfile` with:

```caddy
crm.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy:

```bash
systemctl reload caddy
```

Caddy requests a Let's Encrypt certificate on the first HTTPS request,
which usually takes 10–30 seconds. From your laptop:

```bash
curl -I https://crm.example.com
```

`HTTP/2 200` means you're live. Open the URL in a browser and create
your first account — the first signup becomes the admin.

## 5. Lock down further sign-ups

Most personal/team installs want signup disabled after the first user.
Add this line to `.env`:

```bash
DISABLE_REGISTRATION=1
```

Then:

```bash
docker compose up -d
```

(If the `users` table is empty, registration is allowed regardless — so
you can't lock yourself out before signing up.)

---

## Backups

Heli is one SQLite file plus a folder of cached images:

```bash
cd /srv/heli
# Hot backup (safe while the app is running)
docker compose exec heli sqlite3 /data/heli.db \
  ".backup /data/backup-$(date +%F).db"
tar czf backup-$(date +%F)-avatars.tgz -C data avatars
```

Rsync the resulting files off-box (S3, another VPS, your laptop) on a
cron schedule of your liking.

## Upgrading

```bash
cd /srv/heli
git pull
docker compose up -d --build
```

Compose only restarts containers whose image or config changed, so
upgrades typically incur 5–10 seconds of downtime.

## Resource usage

A single user with a few thousand records typically sits at:

- ~150 MB RSS for the Node process
- ~10 MB for Caddy
- ~100 MB for the SQLite database

The default `512 MB` memory limit on a CPX22 is plenty. If you go below
1 GB RAM, drop `SQLITE_CACHE_MB=8` and `SQLITE_MMAP_MB=32`.

## Troubleshooting

| Symptom                                  | Check                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `curl https://...` times out             | DNS not resolving yet; firewall blocking 80/443; Caddy not running.                    |
| TLS error / "no cert"                    | Caddy needs ports 80 *and* 443 open and DNS pointing at the VPS.                       |
| 502 from Caddy                           | Container not running. `docker compose ps`, then `docker compose logs heli`.           |
| Avatars 404 after a redeploy             | The bind mount is gone. Check `docker compose config` and that `./data` still exists.  |
| "Please select a data region" on signup  | You're on an old build. `git pull && docker compose up -d --build`.                    |

For anything else, `docker compose logs -f heli` and the systemd Caddy
logs (`journalctl -u caddy -f`) are the first places to look.
