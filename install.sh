#!/bin/sh
# Heli one-line installer.
#
#   curl -sSL https://heli.so/install | sudo sh
#
# Non-interactive mode:
#   curl -sSL https://heli.so/install | sudo HELI_DOMAIN=crm.example.com HELI_EMAIL=you@example.com sh

set -eu

INSTALL_DIR=/srv/heli
COMPOSE_URL=https://raw.githubusercontent.com/heindewilde/heli/main/docker-compose.yml

BLUE=$(printf '\033[0;34m'); GREEN=$(printf '\033[0;32m')
YELLOW=$(printf '\033[0;33m'); RED=$(printf '\033[0;31m'); NC=$(printf '\033[0m')
say()  { printf "%s==>%s %s\n" "$BLUE" "$NC" "$*"; }
ok()   { printf "%s✓%s   %s\n" "$GREEN" "$NC" "$*"; }
warn() { printf "%s!%s   %s\n" "$YELLOW" "$NC" "$*" >&2; }
die()  { printf "%s✗%s   %s\n" "$RED" "$NC" "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root: curl -sSL https://heli.so/install | sudo sh"
[ "$(uname -s)" = Linux ] || die "Only Linux is supported."
[ -r /etc/os-release ] || die "Unknown distro (no /etc/os-release)."
. /etc/os-release
case "${ID:-}${ID_LIKE:-}" in
  *ubuntu*|*debian*) : ;;
  *) die "Only Ubuntu/Debian are supported. See SELFHOST.md for manual steps on other distros." ;;
esac

# Prompts: if stdin is a pipe (curl | sh), reopen the terminal so reads work.
if [ ! -t 0 ] && [ -r /dev/tty ]; then exec </dev/tty; fi

ask() {
  _prompt=$1; _var=$2
  eval "_val=\${$_var:-}"
  while [ -z "$_val" ]; do
    printf "%s " "$_prompt"
    IFS= read -r _val || _val=""
  done
  eval "$_var=\$_val"
}

ask "What domain will Heli live on? (e.g. crm.example.com):" HELI_DOMAIN
ask "Email for TLS renewal notifications:" HELI_EMAIL

# Sanity-check DNS without blocking install — Caddy will retry forever anyway.
SERVER_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo)
DOMAIN_IP=$(getent ahostsv4 "$HELI_DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')
if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  warn "$HELI_DOMAIN resolves to $DOMAIN_IP but this server is $SERVER_IP."
  warn "TLS will fail until DNS points here. Continuing — re-run the installer once DNS is correct."
elif [ -z "$DOMAIN_IP" ]; then
  warn "$HELI_DOMAIN doesn't resolve yet. Add an A record: $HELI_DOMAIN -> $SERVER_IP"
  warn "The installer will continue; the cert will issue once DNS lands."
fi

export DEBIAN_FRONTEND=noninteractive
say "Updating package index…"
apt-get update -qq
apt-get install -yqq curl ca-certificates gnupg apt-transport-https openssl

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker…"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) ready"

if ! command -v caddy >/dev/null 2>&1; then
  say "Installing Caddy (auto-HTTPS reverse proxy)…"
  apt-get install -yqq debian-keyring debian-archive-keyring
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -yqq caddy
fi
systemctl enable --now caddy >/dev/null
ok "Caddy $(caddy version | awk '{print $1}') ready"

# Open firewall if ufw is active.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

say "Preparing $INSTALL_DIR…"
mkdir -p "$INSTALL_DIR/data/avatars"
cd "$INSTALL_DIR"

curl -fsSL "$COMPOSE_URL" -o docker-compose.yml.new
mv docker-compose.yml.new docker-compose.yml

if [ ! -f .env ]; then
  cat > .env <<EOF
ORIGIN=https://$HELI_DOMAIN
# PUBLIC_LOGODEV_KEY=     # free key at https://logo.dev for pretty company logos
# ENABLE_REGISTRATION=1   # sign-ups close after the first account; set this to reopen them
# DISABLE_REGISTRATION=1  # hard kill switch for sign-ups
EOF
  chmod 600 .env
  ok "Wrote $INSTALL_DIR/.env"
else
  ok "Reusing existing $INSTALL_DIR/.env"
fi

say "Pulling Heli image…"
docker compose pull --quiet
docker compose up -d --remove-orphans >/dev/null

say "Configuring Caddy for $HELI_DOMAIN…"
CADDY=/etc/caddy/Caddyfile
[ -f "$CADDY.heli-backup" ] || cp "$CADDY" "$CADDY.heli-backup" 2>/dev/null || true
cat > "$CADDY" <<EOF
{
  email $HELI_EMAIL
}

$HELI_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy

say "Waiting for HTTPS (Let's Encrypt usually issues a cert within 30s)…"
ATTEMPTS=0
MAX=24
while [ $ATTEMPTS -lt $MAX ]; do
  if curl -fsS -o /dev/null --max-time 10 "https://$HELI_DOMAIN/"; then
    echo ""
    ok "Heli is live at https://$HELI_DOMAIN"
    echo ""
    printf "Open the URL in your browser and create your first account.\n"
    printf "That account becomes the admin.\n\n"
    printf "Useful files:\n"
    printf "  config   : %s/.env\n" "$INSTALL_DIR"
    printf "  data     : %s/data/heli.db\n" "$INSTALL_DIR"
    printf "  upgrade  : cd %s && docker compose pull && docker compose up -d\n" "$INSTALL_DIR"
    printf "  logs     : docker compose -f %s/docker-compose.yml logs -f heli\n" "$INSTALL_DIR"
    exit 0
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 5
done

warn "HTTPS didn't respond within 2 minutes. Diagnose with:"
warn "  docker compose -f $INSTALL_DIR/docker-compose.yml logs heli"
warn "  journalctl -u caddy -n 50 --no-pager"
warn "Once you fix DNS / firewall, re-run this installer to retry."
exit 1
