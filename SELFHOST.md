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
# Persistent data directory (database + uploaded avatars)
mkdir -p /srv/heli/data/avatars

# Build the image from the public repo
git clone --depth 1 https://github.com/heindewilde/heli.git /opt/heli
docker build -t heli:latest /opt/heli

# Generate one secret used to sign inbound-email URLs
INBOUND_SECRET=$(openssl rand -hex 32)

# Run it (bound to localhost — Caddy will reverse-proxy)
docker run -d --name heli --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v /srv/heli/data:/data \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e ORIGIN=https://crm.example.com \
  -e DB_PATH=/data/heli.db \
  -e AVATARS_DIR=/data/avatars \
  -e INBOUND_EMAIL_SECRET="$INBOUND_SECRET" \
  heli:latest
```

### Optional environment variables

| Variable             | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `PUBLIC_LOGODEV_KEY` | Pretty company logos via [logo.dev](https://logo.dev). Free tier exists. Without it, logos fall back to fetched OG images or initials. |
| `SQLITE_CACHE_MB`    | SQLite page cache. Default `16`. Lower it on a tiny VPS. |
| `SQLITE_MMAP_MB`     | SQLite mmap window. Default `64`. Same.             |

Pass with `-e VAR=value` on the `docker run` line.

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
Add `-e DISABLE_REGISTRATION=1` to the `docker run` line and restart:

```bash
docker rm -f heli
docker run -d ... -e DISABLE_REGISTRATION=1 ... heli:latest
```

(If the `users` table is empty, registration is allowed regardless — so
you can't lock yourself out before signing up.)

---

## Backups

Heli is one SQLite file plus a folder of cached images. Back them up with:

```bash
# Hot backup (safe while the app is running)
sqlite3 /srv/heli/data/heli.db ".backup /srv/heli/backup-$(date +%F).db"
tar czf /srv/heli/backup-$(date +%F)-avatars.tgz -C /srv/heli/data avatars
```

Rsync the resulting files off-box (S3, another VPS, your laptop) on a
cron schedule of your liking.

## Upgrading

```bash
cd /opt/heli && git pull
docker build -t heli:latest .
docker rm -f heli && docker run -d --name heli --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v /srv/heli/data:/data \
  -e PORT=3000 -e NODE_ENV=production \
  -e ORIGIN=https://crm.example.com \
  -e DB_PATH=/data/heli.db -e AVATARS_DIR=/data/avatars \
  -e INBOUND_EMAIL_SECRET="$(cat /srv/heli/inbound-secret 2>/dev/null || \
       (openssl rand -hex 32 | tee /srv/heli/inbound-secret))" \
  heli:latest
```

(Save your env vars to a file once and source it before `docker run` if
you'd rather not paste them every time.)

## Resource usage

A single user with a few thousand records typically sits at:

- ~150 MB RSS for the Node process
- ~10 MB for Caddy
- ~100 MB for the SQLite database

The default `512 MB` memory limit on a CPX22 is plenty. If you go below
1 GB RAM, drop `SQLITE_CACHE_MB=8` and `SQLITE_MMAP_MB=32`.

## Troubleshooting

| Symptom                                  | Check                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `curl https://...` times out             | DNS not resolving yet; firewall blocking 80/443; Caddy not running.   |
| TLS error / "no cert"                    | Caddy needs ports 80 *and* 443 open and DNS pointing at the VPS.       |
| 502 from Caddy                           | Container not running. `docker ps`, then `docker logs heli`.           |
| Avatars 404 after a redeploy             | Confirm `-v /srv/heli/data:/data` is on the `docker run` command.      |
| "Please select a data region" on signup  | You're on an old build. Pull `main` and rebuild.                       |

For anything else, `docker logs -f heli` and the systemd Caddy logs
(`journalctl -u caddy -f`) are the first places to look.
