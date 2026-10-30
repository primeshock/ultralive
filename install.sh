#!/usr/bin/env bash
# Ultra Live — automatic installer (Ubuntu 22.04+/Debian 12+, run as root).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/primeshock/ultralive/koosha-live-v2/install.sh)
#
# First run: creates a NEW empty database. Re-run: keeps your data and updates in place
# (use --fresh to start over; move data between servers with the owner panel's Backup / Restore).
# Options (all optional, otherwise you are asked):
#   --domain example.com    serve over this domain (Let's Encrypt certificate)
#   --email you@mail.com    contact e-mail for Let's Encrypt
#   --owner-user NAME  --owner-pass PASS
#   --branch NAME           git branch to install (default: koosha-live-v2)
#   --fresh                 wipe the existing install (a backup is taken first) and start clean
#   --yes                   never ask; use defaults / generate passwords
# Re-running on a server that already has Ultra Live KEEPS all data and just updates it.
set -Eeuo pipefail

REPO_URL="${ULTRALIVE_REPO:-https://github.com/primeshock/ultralive.git}"
BRANCH="koosha-live-v2"
APP_DIR="/opt/unlimited-stream"
LIVEKIT_DIR="/opt/livekit"
NODE_MAJOR=22
DOMAIN=""; EMAIL=""; OWNER_USER=""; OWNER_PASS=""; ASSUME_YES="false"; FORCE_FRESH="false"

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
log()  { echo; echo "${c_ok}▶ $*${c_off}"; }
warn() { echo "${c_warn}⚠ $*${c_off}"; }
die()  { echo "${c_err}✖ $*${c_off}" >&2; exit 1; }
trap 'die "Install stopped at line $LINENO. Log: /var/log/ultralive-install.log"' ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --owner-user) OWNER_USER="${2:-}"; shift 2 ;;
    --owner-pass) OWNER_PASS="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    --fresh) FORCE_FRESH="true"; shift ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run this script as root (sudo)."
exec > >(tee -a /var/log/ultralive-install.log) 2>&1

TTY=/dev/tty
ask() { # ask "prompt" default -> echoes answer
  local prompt="$1" default="${2:-}" reply=""
  if [[ "$ASSUME_YES" == "true" || ! -r $TTY ]]; then echo "$default"; return; fi
  read -r -p "$prompt" reply < $TTY || true
  echo "${reply:-$default}"
}
ask_secret() {
  local prompt="$1" reply=""
  if [[ "$ASSUME_YES" == "true" || ! -r $TTY ]]; then echo ""; return; fi
  read -r -s -p "$prompt" reply < $TTY || true; echo >&2
  echo "$reply"
}
# Next.js needs ~2 GB to build; small VPS plans get killed (SIGKILL) without swap.
ensure_swap() {
  local mem_mb swap_mb size
  mem_mb="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
  swap_mb="$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo)"
  if (( mem_mb + swap_mb < 4000 )); then
    size=$(( 4096 - mem_mb - swap_mb )); (( size < 1024 )) && size=1024
    log "Low memory (${mem_mb} MB RAM): creating ${size} MB swap"
    if [[ ! -f /swapfile ]]; then
      fallocate -l "${size}M" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count="$size" status=none
      chmod 600 /swapfile; mkswap /swapfile >/dev/null
    fi
    swapon /swapfile 2>/dev/null || true
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}
apt_retry() { for i in 1 2 3; do DEBIAN_FRONTEND=noninteractive apt-get "$@" && return 0; sleep 4; done; return 1; }

# ---------------------------------------------------------------------------
echo "${c_ok}"
cat <<'BANNER'
  ╔══════════════════════════════════════════════╗
  ║          Ultra Live — Auto Installer          ║
  ╚══════════════════════════════════════════════╝
BANNER
echo "${c_off}"

PUBLIC_IP="$(curl -fsS --max-time 6 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 6 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
[[ -n "$PUBLIC_IP" ]] || die "Could not detect the server's public IP."
echo "Server IP: ${PUBLIC_IP}"

BACKEND_DIR="$APP_DIR/unlimited-stream-backend"; FRONT_DIR="$APP_DIR/unlimited-stream-front"; ENV_FILE="$BACKEND_DIR/.env"
env_get() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }
env_set_if_missing() { grep -q "^$1=" "$ENV_FILE" || echo "$1=$2" >> "$ENV_FILE"; }

MODE="fresh"
if [[ -f "$ENV_FILE" && -d "$APP_DIR/.git" && "$FORCE_FRESH" != "true" ]]; then
  MODE="keep"
  if [[ "$ASSUME_YES" != "true" && -r $TTY ]]; then
    echo "An existing Ultra Live install was found in ${APP_DIR}."
    case "$(ask '[K]eep data and update (default)  /  [F]resh install (backup, then wipe): ' K)" in f|F) MODE="fresh" ;; esac
  fi
fi
echo "Install mode: ${MODE}"

if [[ "$MODE" == "keep" ]]; then
  HOST="$(env_get PUBLIC_BASE_URL)"; HOST="${HOST#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
  [[ -n "$HOST" ]] || HOST="$PUBLIC_IP"
  if [[ "$HOST" =~ ^[0-9.]+$ ]]; then DOMAIN=""; else DOMAIN="$HOST"; fi
  LK_KEY="$(env_get LIVEKIT_API_KEY)"; LK_SECRET="$(env_get LIVEKIT_API_SECRET)"
  [[ -n "$LK_KEY" && -n "$LK_SECRET" ]] || die "The existing .env is incomplete; re-run with --fresh."
  OWNER_USER="(unchanged)"; GENERATED_PASS="false"
else
if [[ -z "$OWNER_USER" ]]; then OWNER_USER="$(ask 'Owner username [admin]: ' admin)"; fi
if [[ -z "$OWNER_PASS" ]]; then
  OWNER_PASS="$(ask_secret 'Owner password (min 8 chars; empty = generate one): ')"
  if [[ -n "$OWNER_PASS" ]]; then
    CONFIRM="$(ask_secret 'Repeat password: ')"
    [[ "$OWNER_PASS" == "$CONFIRM" ]] || die "Passwords do not match."
  fi
fi
GENERATED_PASS="false"
if [[ -z "$OWNER_PASS" ]]; then OWNER_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)"; GENERATED_PASS="true"; fi
[[ ${#OWNER_PASS} -ge 8 ]] || die "Password must be at least 8 characters."
[[ "$OWNER_USER" =~ ^[A-Za-z0-9_]{3,24}$ ]] || die "Username must be 3-24 characters (letters, digits or _)."

if [[ -z "$DOMAIN" ]]; then DOMAIN="$(ask 'Domain (optional; empty = IP only): ' '')"; fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
if [[ -n "$DOMAIN" && -z "$EMAIL" ]]; then EMAIL="$(ask 'E-mail for Let'"'"'s Encrypt (optional): ' '')"; fi
HOST="${DOMAIN:-$PUBLIC_IP}"
[[ -n "$DOMAIN" ]] && echo "Mode: domain ($DOMAIN) + automatic SSL" || echo "Mode: IP only ($PUBLIC_IP) + IP SSL (Let's Encrypt)"
fi

# ---------------------------------------------------------------------------
ensure_swap
log "1/9 Base packages"
apt_retry update -qq
apt_retry install -y -qq curl git ca-certificates gnupg ufw openssl nginx ffmpeg snapd tar >/dev/null

log "2/9 Docker"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker >/dev/null 2>&1 || true

log "3/9 Node.js ${NODE_MAJOR} and pm2"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | tr -dc '0-9.' | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt_retry install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null

# ---------------------------------------------------------------------------
log "4/9 Application source (${BRANCH})"
fresh_cleanup() {
  local stamp; stamp="$(date +%Y%m%d-%H%M%S)"
  if [[ -f "$ENV_FILE" ]]; then
    mkdir -p /root/ultralive-backups
    echo "Backing up the existing database to /root/ultralive-backups/before-fresh-${stamp}.tar.gz ..."
    if ! (cd "$BACKEND_DIR" && timeout 180 node scripts/backup.js "/root/ultralive-backups/before-fresh-${stamp}.tar.gz") >/dev/null 2>&1; then
      [[ "$ASSUME_YES" == "true" ]] || [[ "$(ask 'Backup failed. Wipe anyway? [y/N]: ' N)" =~ ^[yY] ]] || die "Aborted; nothing was deleted."
      warn "Could not back up the old database; continuing."
    fi
  fi
  pm2 delete all >/dev/null 2>&1 || true
  rm -rf "$APP_DIR" "${APP_DIR}".old-*
  local c v
  for c in $(docker ps -a --format '{{.Names}}' | grep -E '^(ultralive-mongo|unlimited-stream-mongo)' || true); do docker rm -f "$c" >/dev/null 2>&1 || true; done
  for v in $(docker volume ls -q | grep -E '^ultralive-mongo-' || true); do docker volume rm "$v" >/dev/null 2>&1 || true; done
}
if [[ "$MODE" == "keep" ]]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  fresh_cleanup
  git clone --depth 50 -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------------------
log "5/9 MongoDB database"
if [[ "$MODE" == "keep" ]]; then
  docker start ultralive-mongo >/dev/null 2>&1 || true
  echo "Keeping the existing database."
else
  MONGO_USER="ul_$(openssl rand -hex 4)"; MONGO_PASS="$(openssl rand -hex 16)"; MONGO_DB="ultralive"
  MONGO_VOLUME="ultralive-mongo-$(date +%s)"
  docker volume create "$MONGO_VOLUME" >/dev/null
  docker run -d --name ultralive-mongo --restart unless-stopped -p 127.0.0.1:27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASS" \
    -v "${MONGO_VOLUME}:/data/db" mongo:7 --bind_ip_all >/dev/null
  echo -n "Waiting for Mongo"; for _ in $(seq 1 40); do
    docker exec ultralive-mongo mongosh --quiet -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; echo -n "."; sleep 2
  done; echo
fi

# ---------------------------------------------------------------------------
log "6/9 LiveKit (interactive rooms + OBS ingest + recording)"
mkdir -p "$LIVEKIT_DIR"
if [[ "$MODE" == "fresh" ]]; then LK_KEY="lk$(openssl rand -hex 8)"; LK_SECRET="$(openssl rand -hex 32)"; fi
cat > "$LIVEKIT_DIR/livekit.yaml" <<EOF
port: 7880
bind_addresses: ["127.0.0.1"]
log_level: info
rtc:
  tcp_port: 7881
  udp_port: 7882          # one multiplexed UDP port: simpler firewall, same performance
  use_external_ip: true
  congestion_control:
    enabled: true
    allow_pause: false
room:
  auto_create: true
  empty_timeout: 300
  departure_timeout: 20
redis:
  address: 127.0.0.1:6379
keys:
  ${LK_KEY}: ${LK_SECRET}
webhook:
  api_key: ${LK_KEY}
  urls:
    - http://127.0.0.1:5050/api/livekit/webhook
ingress:
  rtmp_base_url: rtmp://${PUBLIC_IP}:1936/live
EOF
cat > "$LIVEKIT_DIR/ingress.yaml" <<EOF
api_key: ${LK_KEY}
api_secret: ${LK_SECRET}
ws_url: ws://127.0.0.1:7880
redis:
  address: 127.0.0.1:6379
rtmp_port: 1936
whip_port: 8089
EOF
mkdir -p /opt/ultralive-recordings && chmod 777 /opt/ultralive-recordings
cat > "$LIVEKIT_DIR/egress.yaml" <<EOF
api_key: ${LK_KEY}
api_secret: ${LK_SECRET}
ws_url: ws://127.0.0.1:7880
redis:
  address: 127.0.0.1:6379
health_port: 9091
EOF
cat > "$LIVEKIT_DIR/docker-compose.yml" <<EOF
services:
  redis:
    image: redis:7
    restart: unless-stopped
    network_mode: host
    command: redis-server --bind 127.0.0.1 --save ""
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    network_mode: host
    volumes: ["${LIVEKIT_DIR}/livekit.yaml:/livekit.yaml:ro"]
    command: --config /livekit.yaml --node-ip=${PUBLIC_IP}
    depends_on: [redis]
  ingress:
    image: livekit/ingress:latest
    restart: unless-stopped
    network_mode: host
    volumes: ["${LIVEKIT_DIR}/ingress.yaml:/ingress.yaml:ro"]
    command: --config /ingress.yaml
    depends_on: [redis, livekit]
  egress:
    image: livekit/egress:latest
    restart: unless-stopped
    network_mode: host
    cap_add: [SYS_ADMIN]
    environment:
      EGRESS_CONFIG_FILE: /egress.yaml
    volumes:
      - ${LIVEKIT_DIR}/egress.yaml:/egress.yaml:ro
      - /opt/ultralive-recordings:/out
    depends_on: [redis, livekit]
EOF
(cd "$LIVEKIT_DIR" && docker compose up -d --remove-orphans)
docker image prune -f >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "7/9 Configuration and build"
SCHEME="https"
if [[ "$MODE" == "fresh" ]]; then
JWT_SECRET="$(openssl rand -hex 32)"; WP_SECRET="$(openssl rand -hex 32)"; ROOM_SECRET="$(openssl rand -hex 32)"
cat > "$BACKEND_DIR/.env" <<EOF
PORT=5050
PUBLIC_PORT=443
RTMP_PORT=1935
HTTP_MEDIA_PORT=8000
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/${MONGO_DB}?authSource=admin
JWT_SECRET=${JWT_SECRET}
ROOM_SESSION_SECRET=${ROOM_SECRET}
WP_JOIN_SECRET=${WP_SECRET}
SERVER_IP=${PUBLIC_IP}
CORS_ORIGIN=${SCHEME}://${HOST}
PUBLIC_BASE_URL=${SCHEME}://${HOST}
FFMPEG_PATH=$(command -v ffmpeg)
COOKIE_SECURE=true
ALLOW_PUBLIC_REGISTER=false
ALLOW_PANEL_UPDATE=true
LIVEKIT_ENABLED=true
LIVEKIT_URL=http://127.0.0.1:7880
LIVEKIT_WS_URL=wss://${HOST}/livekit
LIVEKIT_API_KEY=${LK_KEY}
LIVEKIT_API_SECRET=${LK_SECRET}
RECORDINGS_DIR=/opt/ultralive-recordings
EOF
chmod 600 "$BACKEND_DIR/.env"
else
  env_set_if_missing COOKIE_SECURE true
  env_set_if_missing ALLOW_PANEL_UPDATE true
  env_set_if_missing RECORDINGS_DIR /opt/ultralive-recordings
fi
cat > "$FRONT_DIR/.env.production" <<EOF
NEXT_PUBLIC_API_URL=${SCHEME}://${HOST}
NEXT_PUBLIC_MEDIA_URL=${SCHEME}://${HOST}
NEXT_PUBLIC_RTMP_URL=rtmp://${PUBLIC_IP}:1935/live
EOF
(cd "$BACKEND_DIR" && npm ci --omit=dev --no-audit --no-fund)
(cd "$FRONT_DIR" && npm ci --no-audit --no-fund)
if [[ "$MODE" == "keep" ]]; then
  # build beside the running site, then swap, so the live UI is never half-built
  (cd "$FRONT_DIR" && rm -rf .next-build && NODE_OPTIONS="--max-old-space-size=2048" NEXT_DIST_DIR=.next-build npm run build && rm -rf .next && mv .next-build .next)
else
  (cd "$FRONT_DIR" && NODE_OPTIONS="--max-old-space-size=2048" npm run build)
  (cd "$BACKEND_DIR" && SEED_OWNER_USERNAME="$OWNER_USER" SEED_OWNER_PASSWORD="$OWNER_PASS" node scripts/seed-owner.js)
fi
chmod +x "$APP_DIR/update.sh"
pm2 startOrReload "$APP_DIR/ecosystem.config.js" --update-env && pm2 save >/dev/null
env PATH="$PATH" pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "8/9 Nginx and SSL"
mkdir -p /var/www/letsencrypt /etc/ultralive-ssl
SSL_CERT=""; SSL_KEY=""; SSL_MODE=""

write_nginx() {
  local cert="$1" key="$2"
  cat > /etc/nginx/sites-available/ultralive <<EOF
map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://${HOST}\$request_uri; }
}

server {
    # the 'listen ... http2' form works on every nginx version
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name ${HOST};
    ssl_certificate ${cert};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    client_max_body_size 250m;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }
    # LiveKit signaling (wss) — media itself flows over UDP 7882 / TCP 7881.
    location /livekit/ {
        proxy_pass http://127.0.0.1:7880/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
    location = /api/system/restore {
        client_max_body_size 4g;
        proxy_request_buffering off;
        proxy_read_timeout 1800s;
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 600s;
    }
    location ~ ^/(site-logo|site-favicon|site-background|thumbnails/.*)\$ {
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host \$host;
    }
    location /live/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering off;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/ultralive /etc/nginx/sites-enabled/ultralive
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
}

self_signed() {
  SSL_MODE="self-signed"
  SSL_CERT=/etc/ultralive-ssl/selfsigned.crt; SSL_KEY=/etc/ultralive-ssl/selfsigned.key
  local san; [[ "$HOST" =~ ^[0-9.]+$ ]] && san="IP:${HOST}" || san="DNS:${HOST}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 -keyout "$SSL_KEY" -out "$SSL_CERT" -subj "/CN=${HOST}" -addext "subjectAltName=${san}" 2>/dev/null
}

# temporary self-signed cert so nginx can start and answer the ACME challenge on :80
self_signed; write_nginx "$SSL_CERT" "$SSL_KEY"

ufw --force reset >/dev/null; ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
for r in OpenSSH 80/tcp 443/tcp 1935/tcp 1936/tcp 7881/tcp 7882/udp; do ufw allow "$r" >/dev/null; done
ufw --force enable >/dev/null

if ! snap list certbot >/dev/null 2>&1; then snap install --classic certbot >/dev/null 2>&1 || warn "Installing certbot via snap failed."; fi
ln -sf /snap/bin/certbot /usr/local/bin/certbot 2>/dev/null || true
CB_EMAIL_ARGS=(--register-unsafely-without-email); [[ -n "$EMAIL" ]] && CB_EMAIL_ARGS=(-m "$EMAIL")
EXISTING_CERT="/etc/letsencrypt/live/${HOST}/fullchain.pem"
if [[ -f "$EXISTING_CERT" ]]; then
  SSL_MODE="letsencrypt-existing"; SSL_CERT="$EXISTING_CERT"; SSL_KEY="/etc/letsencrypt/live/${HOST}/privkey.pem"
elif command -v certbot >/dev/null 2>&1; then
  if [[ -n "$DOMAIN" ]]; then
    RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
    [[ "$RESOLVED" == "$PUBLIC_IP" ]] || warn "DNS for the domain (${RESOLVED:-unknown}) does not match this server (${PUBLIC_IP}); getting a certificate may fail."
    if certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" --non-interactive --agree-tos "${CB_EMAIL_ARGS[@]}" --deploy-hook "systemctl reload nginx"; then
      SSL_MODE="letsencrypt-domain"; SSL_CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"; SSL_KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
    fi
  else
    # Let's Encrypt IP-address certificates: 6-day lifetime, webroot challenge, needs certbot >= 5.4.
    if certbot certonly --webroot -w /var/www/letsencrypt --preferred-profile shortlived --ip-address "$PUBLIC_IP" --non-interactive --agree-tos "${CB_EMAIL_ARGS[@]}" --deploy-hook "systemctl reload nginx"; then
      SSL_MODE="letsencrypt-ip"; SSL_CERT="/etc/letsencrypt/live/${PUBLIC_IP}/fullchain.pem"; SSL_KEY="/etc/letsencrypt/live/${PUBLIC_IP}/privkey.pem"
    fi
  fi
fi
if [[ "$SSL_MODE" == letsencrypt-* ]]; then write_nginx "$SSL_CERT" "$SSL_KEY"
else warn "Could not get a Let's Encrypt certificate; continuing with a self-signed one (browsers will warn). Re-run certbot later to fix."; SSL_MODE="self-signed"; fi

# ---------------------------------------------------------------------------
log "9/9 Final checks"
sleep 4
curl -ksf "https://127.0.0.1/api/health" -H "Host: ${HOST}" >/dev/null && HEALTH="OK" || HEALTH="FAILED (check: pm2 logs)"
echo "${c_ok}"
cat <<EOF
╔════════════════════════════════════════════════════════════╗
  ✅ Installation complete
╚════════════════════════════════════════════════════════════╝
EOF
echo "${c_off}"
echo "Site:               ${SCHEME}://${HOST}"
echo "Admin login:        ${SCHEME}://${HOST}/adminlogin"
if [[ "$MODE" == "keep" ]]; then echo "Data:               kept (owner login unchanged)"; else echo "Owner username:     ${OWNER_USER}"; fi
if [[ "$MODE" == "fresh" ]]; then
  [[ "$GENERATED_PASS" == "true" ]] && echo "Owner password:     ${OWNER_PASS}   ${c_warn}(save it now)${c_off}" || echo "Owner password:     (the one you entered)"
fi
echo "SSL:                ${SSL_MODE}"
echo "API status:         ${HEALTH}"
echo "RTMP (OBS):         rtmp://${PUBLIC_IP}:1935/live   — or the LiveKit key from the class panel"
echo "WordPress secret:   ${BACKEND_DIR}/.env  (WP_JOIN_SECRET)"
echo "Backup / update:    owner panel → System & backup"
echo "Install log:        /var/log/ultralive-install.log"
