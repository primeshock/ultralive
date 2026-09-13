#!/usr/bin/env bash
#
# Easy-install for Koosha Live (Unlimited Stream engine).
# Sets up a fresh Ubuntu/Debian server end-to-end: Docker + MongoDB (in Docker,
# random credentials), Node.js + ffmpeg + PM2, Nginx as a reverse proxy on :80,
# firewall locked down to only what needs to be public, then starts everything.
#
# Usage (as root, on a fresh server):
#   sudo bash install.sh [PUBLIC_IP]
#
# PUBLIC_IP is optional — if omitted, the script guesses it via an external
# "what's my IP" service. That guess is WRONG on servers behind NAT / with
# multiple IPs (it only sees your outbound-facing IP, which can differ from the
# IP others actually reach you on — e.g. the one you SSH'd in through). If in
# doubt, just pass it explicitly:
#   sudo bash install.sh 203.0.113.10
#
# Safe to re-run: skips steps that are already done, pulls the latest code, and
# restarts the app with pm2 instead of failing on things that already exist.

set -euo pipefail

# ---------------------------------------------------------------------------
# Logging & error handling — everything printed here also goes to LOG_FILE, and
# any failure prints exactly which line broke and where to look for details.
# ---------------------------------------------------------------------------
LOG_FILE="/var/log/unlimited-stream-install.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/unlimited-stream-install.log"
exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local line=$1
  echo
  echo "❌ نصب توی خط $line شکست خورد."
  echo "   جزئیات کامل توی لاگ: $LOG_FILE"
  echo "   اسکریپت idempotent‌ه — بعد از رفع مشکل دوباره اجراش کن، از همونجا ادامه میده."
  exit 1
}
trap 'on_error $LINENO' ERR

log() {
  echo
  echo "==> [$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo
}

# Fresh Ubuntu images commonly run `unattended-upgrades` shortly after boot, which
# holds the dpkg/apt lock for anywhere from a few seconds to a couple of minutes.
# Retry instead of failing outright the first time apt is busy.
apt_get_retry() {
  local attempt=1
  local max_attempts=30
  until apt-get "$@"; do
    if (( attempt >= max_attempts )); then
      echo "apt-get $* بعد از $max_attempts بار تلاش هنوز شکست می‌خوره."
      return 1
    fi
    echo "apt مشغوله (احتمالاً unattended-upgrades) — تلاش ${attempt}/${max_attempts}، ۱۰ ثانیه صبر می‌کنیم..."
    sleep 10
    attempt=$((attempt + 1))
  done
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "این اسکریپت باید با root/sudo اجرا بشه: sudo bash install.sh"
  exit 1
fi

if [[ ! -f /etc/os-release ]] || ! grep -qiE 'ubuntu|debian' /etc/os-release; then
  echo "این اسکریپت فقط روی Ubuntu/Debian تست شده. سیستم‌عاملت پشتیبانی نمیشه."
  exit 1
fi

REPO_URL="https://github.com/primeshock/ultralive.git"
APP_DIR="/opt/unlimited-stream"
BACKEND_DIR="$APP_DIR/unlimited-stream-backend"
FRONTEND_DIR="$APP_DIR/unlimited-stream-front"
MONGO_CONTAINER="unlimited-stream-mongo"
MONGO_VOLUME="unlimited-stream-mongo-data"
NODE_MAJOR=20

# ---------------------------------------------------------------------------
# 1/9 — base packages
# ---------------------------------------------------------------------------
log "1/9 آپدیت apt و نصب پکیج‌های پایه"
export DEBIAN_FRONTEND=noninteractive

# A previous Docker installation can leave an unsupported or unsigned Docker
# apt source behind (for example, a source targeting Ubuntu "resolute"). The
# official Docker installer below recreates its own source, so disable only
# existing Docker source files before the first apt update.
for apt_source in /etc/apt/sources.list.d/*; do
  if [[ -f "$apt_source" ]] && grep -q 'download\.docker\.com' "$apt_source"; then
    mv "$apt_source" "${apt_source}.koosha-disabled"
    echo "Docker apt source غیرفعال شد: $apt_source"
  fi
done
if [[ -f /etc/apt/sources.list ]] && grep -q 'download\.docker\.com' /etc/apt/sources.list; then
  sed -i.bak '/download\.docker\.com/s/^/# disabled by Koosha Live installer: /' /etc/apt/sources.list
  echo "Docker apt source داخل /etc/apt/sources.list غیرفعال شد."
fi

apt_get_retry update -y
apt_get_retry install -y curl git ca-certificates gnupg ufw openssl

# ---------------------------------------------------------------------------
# 2/9 — Docker
# ---------------------------------------------------------------------------
log "2/9 نصب Docker"
if command -v docker >/dev/null 2>&1; then
  echo "Docker از قبل نصبه، رد میشیم."
else
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi
systemctl enable --now docker

# ---------------------------------------------------------------------------
# 3/9 — MongoDB in Docker, random credentials, localhost-only
# ---------------------------------------------------------------------------
log "3/9 راه‌اندازی MongoDB روی Docker"
ENV_FILE="$BACKEND_DIR/.env"

if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  echo "کانتینر Mongo از قبل هست — رد میشیم (دیتا و پسورد قبلی دست‌نخورده می‌مونه)."
  if [[ -f "$ENV_FILE" ]]; then
    MONGO_USER=$(grep -oP '(?<=mongodb://)[^:]+' "$ENV_FILE" | head -1 || true)
    MONGO_PASS=$(grep -oP '(?<=mongodb://)[^:]+:\K[^@]+' "$ENV_FILE" | head -1 || true)
  fi
  MONGO_USER="${MONGO_USER:-unknown}"
  MONGO_PASS="${MONGO_PASS:-unknown (already configured on first run)}"
else
  MONGO_USER="stream_admin"
  # NOT `tr -dc ... </dev/urandom | head -c N`: head closes the pipe as soon as it
  # has enough bytes, tr then gets SIGPIPE, and with `set -o pipefail` that makes
  # the whole pipeline "fail" even though the substitution captured the right
  # output — aborts the script right here. openssl rand has no such pipe to break.
  MONGO_PASS="$(openssl rand -hex 12)"
  docker volume create "$MONGO_VOLUME" >/dev/null
  docker run -d \
    --name "$MONGO_CONTAINER" \
    --restart unless-stopped \
    -p 127.0.0.1:27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
    -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASS" \
    -v "$MONGO_VOLUME":/data/db \
    mongo:7 >/dev/null
  echo "منتظر بالا اومدن Mongo..."
  sleep 5
fi

# ---------------------------------------------------------------------------
# 4/9 — Node.js, ffmpeg, pm2
# ---------------------------------------------------------------------------
log "4/9 نصب Node.js ${NODE_MAJOR}.x، ffmpeg و pm2"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | grep -oP '(?<=v)\d+')" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt_get_retry install -y nodejs
fi
apt_get_retry install -y ffmpeg
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# ---------------------------------------------------------------------------
# 5/9 — get the code
# ---------------------------------------------------------------------------
log "5/9 گرفتن کد از $REPO_URL"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------------------
# 6/9 — detect the server's public IP
# ---------------------------------------------------------------------------
log "6/9 تشخیص آی‌پی عمومی سرور"
# ${1:-}/$SERVER_PUBLIC_IP: پاس بده اگه از قبل می‌دونی، وگرنه حدس می‌زنیم.
PUBLIC_IP="${1:-${SERVER_PUBLIC_IP:-}}"
# Opt-in flag: `sudo bash install.sh <IP> --with-livekit` or WITH_LIVEKIT=true.
# Off by default — LiveKit needs a real UDP port range reachable from the
# internet, which doesn't work on every VPS/NAT setup out of the box. HLS/RTMP
# works fully without this either way.
WITH_LIVEKIT="${WITH_LIVEKIT:-false}"
[[ "${2:-}" == "--with-livekit" ]] && WITH_LIVEKIT="true"
if [[ -n "$PUBLIC_IP" ]]; then
  echo "آی‌پی داده‌شده استفاده میشه: $PUBLIC_IP"
else
  PUBLIC_IP="$(curl -fsSL --max-time 5 https://api.ipify.org || true)"
  [[ -z "$PUBLIC_IP" ]] && PUBLIC_IP="$(curl -fsSL --max-time 5 https://ifconfig.me || true)"
  [[ -z "$PUBLIC_IP" ]] && PUBLIC_IP="$(curl -fsSL --max-time 5 https://icanhazip.com | tr -d '[:space:]' || true)"
  if [[ -z "$PUBLIC_IP" ]]; then
    echo "نتونستم آی‌پی عمومی رو تشخیص بدم — از آی‌پی محلی استفاده می‌کنم (ممکنه از بیرون کار نکنه)."
    PUBLIC_IP="$(hostname -I | awk '{print $1}')"
  fi
  echo "آی‌پی سرور (حدس زده‌شده): $PUBLIC_IP"
  echo "⚠️  این روش IP رو از سرویس‌های بیرونی (ipify و...) حدس می‌زنه، که فقط IP خروجی رو می‌بینن —"
  echo "   اگه سرور پشت NAT باشه یا چند IP داشته باشه، ممکنه این IP همون IP ای نباشه که ازش بهت SSH زدی."
  echo "   اگه بعد نصب سایت بالا نیومد، دوباره اجرا کن و IP درست رو صریح بده:"
  echo "   sudo bash install.sh YOUR_CORRECT_IP"
fi

# ---------------------------------------------------------------------------
# 7/9 — env files (must exist BEFORE the frontend build — NEXT_PUBLIC_* vars
# are baked in at build time, not read at runtime)
# ---------------------------------------------------------------------------
log "7/9 نوشتن فایل‌های .env"

# Keep the JWT secret stable across re-runs (don't invalidate existing logins
# every time), but always rewrite SERVER_IP/CORS_ORIGIN — that's exactly what
# needs to be fixable by re-running with a corrected IP argument.
JWT_SECRET=""
[[ -f "$ENV_FILE" ]] && JWT_SECRET="$(grep -oP '(?<=^JWT_SECRET=).*' "$ENV_FILE" || true)"
[[ -z "$JWT_SECRET" ]] && JWT_SECRET="$(openssl rand -hex 32)"

WP_JOIN_SECRET=""
[[ -f "$ENV_FILE" ]] && WP_JOIN_SECRET="$(grep -oP '(?<=^WP_JOIN_SECRET=).*' "$ENV_FILE" || true)"
[[ -z "$WP_JOIN_SECRET" ]] && WP_JOIN_SECRET="$(openssl rand -hex 32)"

ROOM_SESSION_SECRET=""
[[ -f "$ENV_FILE" ]] && ROOM_SESSION_SECRET="$(grep -oP '(?<=^ROOM_SESSION_SECRET=).*' "$ENV_FILE" || true)"
[[ -z "$ROOM_SESSION_SECRET" ]] && ROOM_SESSION_SECRET="$(openssl rand -hex 32)"

cat > "$ENV_FILE" <<EOF
PORT=5050
PUBLIC_PORT=80
RTMP_PORT=1935
HTTP_MEDIA_PORT=8000
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/unlimited-stream?authSource=admin
JWT_SECRET=${JWT_SECRET}
SERVER_IP=${PUBLIC_IP}
CORS_ORIGIN=http://${PUBLIC_IP}
FFMPEG_PATH=$(command -v ffmpeg)
WP_JOIN_SECRET=${WP_JOIN_SECRET}
ROOM_SESSION_SECRET=${ROOM_SESSION_SECRET}
PUBLIC_BASE_URL=http://${PUBLIC_IP}
EOF
echo "$BACKEND_DIR/.env نوشته شد."

cat > "$FRONTEND_DIR/.env.production" <<EOF
NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}
NEXT_PUBLIC_MEDIA_URL=http://${PUBLIC_IP}
NEXT_PUBLIC_RTMP_URL=rtmp://${PUBLIC_IP}:1935/live
EOF

# ---------------------------------------------------------------------------
# 8/9 — install deps and build
# ---------------------------------------------------------------------------
log "8/9 نصب پکیج‌ها و build گرفتن"
(cd "$BACKEND_DIR" && npm install --omit=dev)
(cd "$FRONTEND_DIR" && npm install && npm run build)

log "ساخت اکانت سوپرادمین (owner)"
(cd "$BACKEND_DIR" && node scripts/seed-owner.js)

# ---------------------------------------------------------------------------
# 9/9 — Nginx reverse proxy
# ---------------------------------------------------------------------------
log "9/9 پیکربندی Nginx"
apt_get_retry install -y nginx

cat > /etc/nginx/sites-available/unlimited-stream <<'EOF'
server {
    listen 80;
    server_name _;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Without this, the backend sees every request as coming from Nginx
        # itself (127.0.0.1) and can't tell visitors apart — see app.js's
        # `trust proxy` setting, which relies on this header being present.
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /thumbnails/ {
        proxy_pass http://127.0.0.1:8000;
    }

    location /live/ {
        proxy_pass http://127.0.0.1:5050;
        # Don't let Nginx buffer whole HLS responses before forwarding them —
        # that would add latency on top of what we already tuned for in
        # mediaServer.js (1s segments).
        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -sf /etc/nginx/sites-available/unlimited-stream /etc/nginx/sites-enabled/unlimited-stream
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ---------------------------------------------------------------------------
# Firewall — only what actually needs to be reachable from the internet:
# SSH (so we don't lock ourselves out), HTTP (Nginx), and RTMP (OBS ingest,
# which can't go through Nginx). Mongo/API/media ports stay closed.
# ---------------------------------------------------------------------------
log "پیکربندی فایروال (ufw)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 1935/tcp

# ---------------------------------------------------------------------------
# LiveKit (optional, Phase 6) — self-hosted via Docker, runs ALONGSIDE the
# RTMP/HLS pipeline above. Only touched if --with-livekit / WITH_LIVEKIT=true
# was passed; otherwise LIVEKIT_ENABLED stays false and nothing changes for
# the existing streaming path.
# ---------------------------------------------------------------------------
LIVEKIT_DIR="/opt/livekit"
if [[ "$WITH_LIVEKIT" == "true" ]]; then
  log "راه‌اندازی LiveKit (اختیاری، --with-livekit)"
  mkdir -p "$LIVEKIT_DIR"

  if [[ -f "$LIVEKIT_DIR/.keys" ]]; then
    LIVEKIT_API_KEY="$(grep -oP '(?<=^KEY=).*' "$LIVEKIT_DIR/.keys")"
    LIVEKIT_API_SECRET="$(grep -oP '(?<=^SECRET=).*' "$LIVEKIT_DIR/.keys")"
    echo "کلیدهای LiveKit از قبل موجودن — استفاده مجدد."
  else
    LIVEKIT_API_KEY="lk$(openssl rand -hex 8)"
    LIVEKIT_API_SECRET="$(openssl rand -hex 32)"
    printf 'KEY=%s\nSECRET=%s\n' "$LIVEKIT_API_KEY" "$LIVEKIT_API_SECRET" > "$LIVEKIT_DIR/.keys"
    chmod 600 "$LIVEKIT_DIR/.keys"
  fi

  cat > "$LIVEKIT_DIR/livekit.yaml" <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
redis:
  address: 127.0.0.1:6379
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
ingress:
  rtmp_base_url: rtmp://${PUBLIC_IP}:1936/live
turn:
  enabled: true
  domain: ${PUBLIC_IP}
  udp_port: 3478
EOF

  # Ingress's own config — rtmp_port MUST be something other than 1935,
  # since node-media-server (our existing OBS ingest) already owns 1935 on
  # this same host with network_mode: host. 1936 here must match the
  # rtmp_base_url port above and the ufw rule below.
  cat > "$LIVEKIT_DIR/ingress.yaml" <<EOF
api_key: ${LIVEKIT_API_KEY}
api_secret: ${LIVEKIT_API_SECRET}
ws_url: ws://127.0.0.1:7880
redis:
  address: 127.0.0.1:6379
rtmp_port: 1936
whip_port: 8089
EOF

  cat > "$LIVEKIT_DIR/docker-compose.yml" <<EOF
services:
  redis:
    image: redis:7
    restart: unless-stopped
    network_mode: host
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    network_mode: host
    volumes:
      - ${LIVEKIT_DIR}/livekit.yaml:/livekit.yaml:ro
    command: --config /livekit.yaml --node-ip=${PUBLIC_IP}
    depends_on:
      - redis
  ingress:
    image: livekit/ingress:latest
    restart: unless-stopped
    network_mode: host
    volumes:
      - ${LIVEKIT_DIR}/ingress.yaml:/ingress.yaml:ro
    command: --config /ingress.yaml
    depends_on:
      - redis
      - livekit
EOF

  (cd "$LIVEKIT_DIR" && docker compose up -d)

  # RTC media (UDP), the Ingress RTMP port, and LiveKit's own signaling port
  # (7880) — LiveKit's WebSocket signaling is used directly by the browser,
  # not proxied through Nginx (this whole deployment has no TLS yet, so
  # there's no wss:// to offer anyway; ws:// direct to the port matches how
  # RTMP already works unproxied here).
  ufw allow 50000:50100/udp
  ufw allow 7880/tcp
  ufw allow 7881/tcp
  ufw allow 1936/tcp    # LiveKit Ingress RTMP — separate from the 1935 RTMP above
  ufw allow 3478/udp    # LiveKit embedded TURN relay for restrictive networks
  echo "LiveKit بالا اومد. کلیدها توی ${LIVEKIT_DIR}/.keys ذخیره شدن."
else
  LIVEKIT_API_KEY=""
  LIVEKIT_API_SECRET=""
fi

# .env was already written in step 7/9, before these values existed — upsert
# them now instead of duplicating the whole heredoc (keeps re-runs idempotent
# whether or not --with-livekit was used this time vs a previous run).
upsert_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}
upsert_env LIVEKIT_ENABLED "$WITH_LIVEKIT"
upsert_env LIVEKIT_URL "http://127.0.0.1:7880"
upsert_env LIVEKIT_WS_URL "ws://${PUBLIC_IP}:7880"
upsert_env LIVEKIT_API_KEY "$LIVEKIT_API_KEY"
upsert_env LIVEKIT_API_SECRET "$LIVEKIT_API_SECRET"

ufw --force enable

# ---------------------------------------------------------------------------
# Start with pm2
# ---------------------------------------------------------------------------
log "استارت اپ‌ها با pm2"
cat > "$APP_DIR/ecosystem.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: 'unlimited-stream-backend',
      cwd: '${BACKEND_DIR}',
      script: 'src/server.js',
    },
    {
      name: 'unlimited-stream-frontend',
      cwd: '${FRONTEND_DIR}',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
    },
  ],
};
EOF

pm2 startOrReload "$APP_DIR/ecosystem.config.js"
pm2 save
STARTUP_CMD="$(pm2 startup systemd -u root --hp /root | tail -1)"
eval "$STARTUP_CMD" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo
echo "✅ نصب با موفقیت تموم شد"
echo
echo "سایت:        http://${PUBLIC_IP}"
echo "RTMP سرور:   rtmp://${PUBLIC_IP}:1935/live"
echo
echo "MongoDB:"
echo "  user: ${MONGO_USER}"
echo "  pass: ${MONGO_PASS}"
echo "  uri:  mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/unlimited-stream?authSource=admin"
echo
echo "سوپرادمین (owner):"
echo "  یوزرنیم: ${SEED_OWNER_USERNAME:-shadowstrix}"
echo "  رمز:     ${SEED_OWNER_PASSWORD:-Azar@1386}"
echo "  (حتماً بعد از اولین ورود عوضش کن)"
echo
echo "کلید مشترک وردپرس (WP_JOIN_SECRET) داخل همینه، برای اتصال به وردپرس لازمت میشه:"
echo "  ${BACKEND_DIR}/.env"
echo
echo "لاگ کامل نصب: $LOG_FILE"
echo "وضعیت پروسه‌ها: pm2 list       لاگ زنده: pm2 logs"
echo
