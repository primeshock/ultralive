#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/var/log/koosha-live-install.log"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/koosha-live-install.log"
exec > >(tee -a "$LOG_FILE") 2>&1

fail(){ echo "❌ installation failed at line $1. Log: $LOG_FILE"; exit 1; }
trap 'fail $LINENO' ERR

[[ $EUID -eq 0 ]] || { echo "Run: sudo bash install.sh [PUBLIC_IP]"; exit 1; }
source /etc/os-release
[[ "$ID" == "ubuntu" || "$ID_LIKE" == *debian* ]] || { echo "Ubuntu/Debian only."; exit 1; }

APP_DIR="${APP_DIR:-/opt/koosha-live}"
BACKEND_DIR="$APP_DIR/unlimited-stream-backend"
FRONTEND_DIR="$APP_DIR/unlimited-stream-front"
REPO_URL="${REPO_URL:-https://github.com/IMMOBINIUM/UnlimitedStream.git}"
NODE_MAJOR=20
DOMAIN="${DOMAIN:-}"
PUBLIC_IP="${1:-${SERVER_PUBLIC_IP:-}}"

apt_retry(){
  local n=1
  until apt-get "$@"; do
    ((n>=20)) && return 1
    sleep 5
    n=$((n+1))
  done
}

apt_retry update
apt_retry install -y curl git ca-certificates gnupg openssl nginx ffmpeg ufw certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt_retry install -y nodejs
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

mkdir -p "$APP_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/unlimited-stream-backend/package.json" && "$SCRIPT_DIR" != "$APP_DIR" ]]; then
  echo "Installing from the current Koosha Live source directory: $SCRIPT_DIR"
  rsync -a --delete --exclude='.git' "$SCRIPT_DIR/" "$APP_DIR/"
elif [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only || true
else
  git clone "$REPO_URL" "$APP_DIR"
fi

ENV_FILE="$BACKEND_DIR/.env"
mkdir -p "$BACKEND_DIR"

# Keep existing Mongo data and secrets on re-runs.
MONGO_CONTAINER="koosha-live-mongo"
MONGO_USER="koosha"
MONGO_PASS=""
if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
  MONGO_PASS="$(grep -oP '(?<=mongodb://${MONGO_USER}:)[^@]+' "$ENV_FILE" 2>/dev/null | head -1 || true)"
else
  MONGO_PASS="$(openssl rand -hex 24)"
  docker volume create koosha-live-mongo-data >/dev/null
  docker run -d --name "$MONGO_CONTAINER" --restart unless-stopped \
    -p 127.0.0.1:27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
    -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASS" \
    -v koosha-live-mongo-data:/data/db mongo:7 >/dev/null
  sleep 5
fi

if [[ -z "$MONGO_PASS" ]]; then
  echo "Could not recover Mongo credentials from existing .env. Refusing to overwrite them." >&2
  exit 1
fi

if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -fsSL --max-time 5 https://api.ipify.org || true)"
fi
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I | awk '{print $1}')}"

JWT_SECRET="$(grep -oP '(?<=^JWT_SECRET=).*' "$ENV_FILE" 2>/dev/null || true)"
WP_JOIN_SECRET="$(grep -oP '(?<=^WP_JOIN_SECRET=).*' "$ENV_FILE" 2>/dev/null || true)"
ROOM_SESSION_SECRET="$(grep -oP '(?<=^ROOM_SESSION_SECRET=).*' "$ENV_FILE" 2>/dev/null || true)"
[[ -n "$JWT_SECRET" && "$JWT_SECRET" != "change-this-secret" ]] || JWT_SECRET="$(openssl rand -hex 32)"
[[ -n "$WP_JOIN_SECRET" ]] || WP_JOIN_SECRET="$(openssl rand -hex 32)"
[[ -n "$ROOM_SESSION_SECRET" ]] || ROOM_SESSION_SECRET="$(openssl rand -hex 32)"

OWNER_FILE="/root/koosha-live-owner.txt"
OWNER_USERNAME="${SEED_OWNER_USERNAME:-}"
OWNER_PASSWORD="${SEED_OWNER_PASSWORD:-}"
if [[ -z "$OWNER_USERNAME" || -z "$OWNER_PASSWORD" ]]; then
  if [[ -f "$OWNER_FILE" ]]; then
    OWNER_USERNAME="$(grep -oP '(?<=^username=).*' "$OWNER_FILE" || true)"
    OWNER_PASSWORD="$(grep -oP '(?<=^password=).*' "$OWNER_FILE" || true)"
  fi
fi
if [[ -z "$OWNER_USERNAME" ]]; then OWNER_USERNAME="owner"; fi
if [[ -z "$OWNER_PASSWORD" ]]; then OWNER_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9@#%+=' | head -c 20)"; fi

if [[ -n "$DOMAIN" ]]; then
  BASE_URL="https://$DOMAIN"
  CORS_ORIGIN="$BASE_URL"
  COOKIE_SECURE=true
else
  BASE_URL="http://$PUBLIC_IP"
  CORS_ORIGIN="$BASE_URL"
  COOKIE_SECURE=false
fi

cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=5050
PUBLIC_PORT=80
RTMP_PORT=1935
HTTP_MEDIA_PORT=8000
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/unlimited-stream?authSource=admin
JWT_SECRET=${JWT_SECRET}
SERVER_IP=${PUBLIC_IP}
CORS_ORIGIN=${CORS_ORIGIN}
COOKIE_SECURE=${COOKIE_SECURE}
FFMPEG_PATH=$(command -v ffmpeg)
WP_JOIN_SECRET=${WP_JOIN_SECRET}
ROOM_SESSION_SECRET=${ROOM_SESSION_SECRET}
PUBLIC_BASE_URL=${BASE_URL}
ALLOW_PUBLIC_REGISTER=false
LIVEKIT_ENABLED=${LIVEKIT_ENABLED:-false}
LIVEKIT_URL=${LIVEKIT_URL:-}
LIVEKIT_WS_URL=${LIVEKIT_WS_URL:-}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-}
ENV
chmod 600 "$ENV_FILE"

cat > "$FRONTEND_DIR/.env.production" <<ENV
NEXT_PUBLIC_API_URL=${BASE_URL}
NEXT_PUBLIC_MEDIA_URL=${BASE_URL}
NEXT_PUBLIC_RTMP_URL=rtmp://${PUBLIC_IP}:1935/live
NEXT_PUBLIC_LIVEKIT_ENABLED=${NEXT_PUBLIC_LIVEKIT_ENABLED:-${LIVEKIT_ENABLED:-false}}
ENV

cat > "$OWNER_FILE" <<EOF2
username=${OWNER_USERNAME}
password=${OWNER_PASSWORD}
EOF2
chmod 600 "$OWNER_FILE"
export SEED_OWNER_USERNAME="$OWNER_USERNAME"
export SEED_OWNER_PASSWORD="$OWNER_PASSWORD"
export MONGO_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@127.0.0.1:27017/unlimited-stream?authSource=admin"

(cd "$BACKEND_DIR" && npm install --omit=dev --no-audit --no-fund)
(cd "$BACKEND_DIR" && node scripts/migrate-roles.js || true)
(cd "$BACKEND_DIR" && node scripts/seed-owner.js)
(cd "$FRONTEND_DIR" && npm install --no-audit --no-fund && npm run build)

cat > /etc/nginx/sites-available/koosha-live <<EOF2
server {
  listen 80;
  server_name ${DOMAIN:-_};

  location /socket.io/ {
    proxy_pass http://127.0.0.1:5050;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:5050;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  }
  location /thumbnails/ { proxy_pass http://127.0.0.1:8000; }
  location /live/ {
    proxy_pass http://127.0.0.1:5050;
    proxy_buffering off;
  }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF2
ln -sf /etc/nginx/sites-available/koosha-live /etc/nginx/sites-enabled/koosha-live
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# Add only required rules; never reset the user's firewall.
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 1935/tcp >/dev/null 2>&1 || true
if [[ "${LIVEKIT_ENABLED:-false}" == "true" ]]; then
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow 7881/tcp >/dev/null 2>&1 || true
  ufw allow 3478/udp >/dev/null 2>&1 || true
  ufw allow 50000:60000/udp >/dev/null 2>&1 || true
  ufw allow 7885/udp >/dev/null 2>&1 || true
fi
ufw --force enable >/dev/null 2>&1 || true

if [[ -n "$DOMAIN" ]]; then
  certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" --redirect || echo "⚠️ HTTPS certificate could not be issued automatically; check DNS and rerun certbot."
fi

cat > "$APP_DIR/ecosystem.config.js" <<EOF2
module.exports={apps:[
{name:'koosha-live-backend',cwd:'${BACKEND_DIR}',script:'src/server.js',env:{NODE_ENV:'production'}},
{name:'koosha-live-frontend',cwd:'${FRONTEND_DIR}',script:'node_modules/.bin/next',args:'start -p 3000',env:{NODE_ENV:'production'}}]};
EOF2
pm2 startOrReload "$APP_DIR/ecosystem.config.js"
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.txt 2>&1 || true

cat <<EOF2

✅ Koosha Live installation finished.
Site: ${BASE_URL}
Owner credentials: ${OWNER_FILE}
Mongo/API/media ports remain localhost/private.

LiveKit is code-integrated but requires a real self-hosted LiveKit deployment with a DNS name, TLS, Redis, TURN/WebRTC ports and API credentials. Set LIVEKIT_ENABLED=true only after that deployment is reachable.

Install log: ${LOG_FILE}
EOF2
