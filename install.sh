#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# UltraLive Installer
# GitHub: https://github.com/primeshock/ultralive
#
# Ubuntu 22.04 / 24.04
# ============================================================

APP_NAME="ultralive"
APP_DIR="/opt/ultralive"
REPO_URL="https://github.com/primeshock/ultralive.git"
BRANCH="main"

BACKEND_DIR="$APP_DIR/unlimited-stream-backend"
FRONTEND_DIR="$APP_DIR/unlimited-stream-front"

BACKEND_PORT="${BACKEND_PORT:-5050}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
RTMP_PORT="${RTMP_PORT:-1935}"
MEDIA_PORT="${MEDIA_PORT:-8000}"

MONGO_CONTAINER="${MONGO_CONTAINER:-ultralive-mongo}"
MONGO_VOLUME="${MONGO_VOLUME:-ultralive-mongo-data}"
MONGO_DB="${MONGO_DB:-ultralive}"

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

LIVEKIT_ENABLED="${LIVEKIT_ENABLED:-false}"

OWNER_USERNAME="${OWNER_USERNAME:-owner}"
OWNER_PASSWORD="${OWNER_PASSWORD:-}"

export DEBIAN_FRONTEND=noninteractive

# ============================================================
# Helpers
# ============================================================

log() {
    echo
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

die() {
    echo
    echo "[ERROR] $1"
    exit 1
}

trap 'echo; echo "[ERROR] Installation failed at line $LINENO."; exit 1' ERR

require_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        die "Run this installer as root: sudo bash install.sh"
    fi
}

random_secret() {
    openssl rand -hex 32
}

random_password() {
    openssl rand -base64 24 | tr -dc 'A-Za-z0-9@#%+=_' | head -c 20
    echo
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================
# Root
# ============================================================

require_root

log "Starting UltraLive installation"

echo "Repository : $REPO_URL"
echo "Install dir: $APP_DIR"
echo "Domain     : ${DOMAIN:-not configured}"
echo "LiveKit    : $LIVEKIT_ENABLED"

# ============================================================
# System update
# ============================================================

log "Updating Ubuntu"

apt-get update -y
apt-get upgrade -y

# ============================================================
# Base packages
# ============================================================

log "Installing system packages"

apt-get install -y \
    ca-certificates \
    curl \
    wget \
    git \
    gnupg \
    lsb-release \
    unzip \
    rsync \
    build-essential \
    openssl \
    nginx \
    ufw \
    certbot \
    python3-certbot-nginx \
    ffmpeg \
    jq \
    net-tools

# ============================================================
# Node.js 20
# ============================================================

log "Installing Node.js 20"

if command_exists node; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
else
    NODE_MAJOR="0"
fi

if [[ "$NODE_MAJOR" != "20" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Node: $(node -v)"
echo "NPM : $(npm -v)"

# ============================================================
# PM2
# ============================================================

log "Installing PM2"

npm install -g pm2

pm2 -v

# ============================================================
# Docker
# ============================================================

log "Installing Docker"

if ! command_exists docker; then
    curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

docker --version

# ============================================================
# Prepare application directory
# ============================================================

log "Preparing application directory"

mkdir -p "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then

    log "Updating existing UltraLive repository"

    cd "$APP_DIR"

    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"

else

    log "Cloning UltraLive repository"

    rm -rf "$APP_DIR"

    git clone \
        --branch "$BRANCH" \
        --single-branch \
        "$REPO_URL" \
        "$APP_DIR"

fi

cd "$APP_DIR"

# ============================================================
# Generate secrets
# ============================================================

log "Preparing environment secrets"

ENV_FILE="$BACKEND_DIR/.env"

mkdir -p "$BACKEND_DIR"

# Preserve existing secrets during upgrades.
if [[ -f "$ENV_FILE" ]]; then

    JWT_SECRET="$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
    WP_JOIN_SECRET="$(grep '^WP_JOIN_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
    ROOM_SESSION_SECRET="$(grep '^ROOM_SESSION_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"

fi

JWT_SECRET="${JWT_SECRET:-$(random_secret)}"
WP_JOIN_SECRET="${WP_JOIN_SECRET:-$(random_secret)}"
ROOM_SESSION_SECRET="${ROOM_SESSION_SECRET:-$(random_secret)}"

# ============================================================
# Owner credentials
# ============================================================

if [[ -z "$OWNER_PASSWORD" ]]; then

    if [[ -f /root/ultralive-owner.txt ]]; then
        EXISTING_OWNER_PASSWORD="$(
            grep '^Password=' /root/ultralive-owner.txt |
            cut -d= -f2- || true
        )"

        if [[ -n "$EXISTING_OWNER_PASSWORD" ]]; then
            OWNER_PASSWORD="$EXISTING_OWNER_PASSWORD"
        fi
    fi

fi

if [[ -z "$OWNER_PASSWORD" ]]; then
    OWNER_PASSWORD="$(random_password)"
fi

# Save credentials BEFORE any step that may fail.
cat > /root/ultralive-owner.txt <<EOF
UltraLive Owner Credentials
===========================

Username=$OWNER_USERNAME
Password=$OWNER_PASSWORD

IMPORTANT:
Store this file securely.
Delete it after saving the credentials elsewhere.

Server:
$(hostname -I | awk '{print $1}')
EOF

chmod 600 /root/ultralive-owner.txt

# ============================================================
# MongoDB
# ============================================================

log "Preparing MongoDB"

if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then

    echo "Existing MongoDB container found."

    docker start "$MONGO_CONTAINER" >/dev/null 2>&1 || true

else

    docker volume inspect "$MONGO_VOLUME" >/dev/null 2>&1 || \
        docker volume create "$MONGO_VOLUME" >/dev/null

    docker run -d \
        --name "$MONGO_CONTAINER" \
        --restart unless-stopped \
        -p 127.0.0.1:27017:27017 \
        -v "$MONGO_VOLUME:/data/db" \
        mongo:8

fi

echo "Waiting for MongoDB..."

for i in {1..60}; do

    if docker exec "$MONGO_CONTAINER" \
        mongosh --quiet \
        --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null |
        grep -q "1"; then

        echo "MongoDB is ready."
        break
    fi

    if [[ "$i" -eq 60 ]]; then
        die "MongoDB did not become ready."
    fi

    sleep 2

done

# ============================================================
# Backend environment
# ============================================================

log "Writing backend environment"

cat > "$BACKEND_DIR/.env" <<EOF
NODE_ENV=production

PORT=$BACKEND_PORT

MONGO_URI=mongodb://127.0.0.1:27017/$MONGO_DB

JWT_SECRET=$JWT_SECRET
WP_JOIN_SECRET=$WP_JOIN_SECRET
ROOM_SESSION_SECRET=$ROOM_SESSION_SECRET

COOKIE_SECURE=$([[ -n "$DOMAIN" ]] && echo true || echo false)

CORS_ORIGIN=$([[ -n "$DOMAIN" ]] && echo "https://$DOMAIN" || echo "*")

# ============================================================
# Streaming
# ============================================================

RTMP_PORT=$RTMP_PORT
MEDIA_PORT=$MEDIA_PORT

# ============================================================
# LiveKit
#
# Leave disabled until a real LiveKit server is configured.
# ============================================================

LIVEKIT_ENABLED=$LIVEKIT_ENABLED

LIVEKIT_API_KEY=${LIVEKIT_API_KEY:-}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET:-}
LIVEKIT_API_URL=${LIVEKIT_API_URL:-}
LIVEKIT_WS_URL=${LIVEKIT_WS_URL:-}
EOF

chmod 600 "$BACKEND_DIR/.env"

# ============================================================
# Backend dependencies
# ============================================================

log "Installing backend dependencies"

cd "$BACKEND_DIR"

npm install --omit=dev

# ============================================================
# Backend validation
# ============================================================

log "Checking backend"

if [[ -f scripts/syntax-check.js ]]; then
    node scripts/syntax-check.js
fi

if [[ -f scripts/migrate-roles.js ]]; then
    node scripts/migrate-roles.js
fi

# ============================================================
# Seed Owner
# ============================================================

log "Creating/updating Owner account"

export SEED_OWNER_USERNAME="$OWNER_USERNAME"
export SEED_OWNER_PASSWORD="$OWNER_PASSWORD"

if [[ -f scripts/seed-owner.js ]]; then
    node scripts/seed-owner.js
else
    echo "WARNING: scripts/seed-owner.js not found."
fi

unset SEED_OWNER_USERNAME
unset SEED_OWNER_PASSWORD

# ============================================================
# Frontend environment
# ============================================================

log "Preparing frontend"

cd "$FRONTEND_DIR"

cat > .env.local <<EOF
NEXT_PUBLIC_LIVEKIT_ENABLED=$LIVEKIT_ENABLED
EOF

# ============================================================
# Frontend dependencies
# ============================================================

log "Installing frontend dependencies"

npm install

# ============================================================
# Frontend build
# ============================================================

log "Building frontend"

npm run build

# ============================================================
# Nginx
# ============================================================

log "Configuring Nginx"

rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/ultralive <<EOF
server {
    listen 80;
    listen [::]:80;

    server_name ${DOMAIN:-_};

    client_max_body_size 100M;

    # ========================================================
    # Backend API
    # ========================================================

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;

        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # ========================================================
    # Socket.IO
    # ========================================================

    location /socket.io/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;

        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # ========================================================
    # HLS / media
    # ========================================================

    location /live/ {
        proxy_pass http://127.0.0.1:$MEDIA_PORT;

        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Access-Control-Allow-Origin "*";
    }

    # ========================================================
    # Thumbnails / media
    # ========================================================

    location /thumbnails/ {
        proxy_pass http://127.0.0.1:$MEDIA_PORT;

        proxy_http_version 1.1;

        proxy_set_header Host \$host;
    }

    # ========================================================
    # Next.js
    # ========================================================

    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;

        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/ultralive \
    /etc/nginx/sites-enabled/ultralive

nginx -t

systemctl enable nginx
systemctl restart nginx

# ============================================================
# Firewall
# ============================================================

log "Configuring firewall"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

# OBS → RTMP
ufw allow "$RTMP_PORT/tcp"

# LiveKit ports ONLY when explicitly enabled.
if [[ "$LIVEKIT_ENABLED" == "true" ]]; then

    ufw allow 7881/tcp
    ufw allow 3478/udp
    ufw allow 50000:60000/udp

fi

ufw --force enable

# ============================================================
# PM2
# ============================================================

log "Starting UltraLive services"

pm2 delete "$APP_NAME-backend" >/dev/null 2>&1 || true
pm2 delete "$APP_NAME-frontend" >/dev/null 2>&1 || true

# Backend
cd "$BACKEND_DIR"

if [[ ! -f server.js ]]; then
    die "Backend server.js was not found."
fi

pm2 start server.js \
    --name "$APP_NAME-backend" \
    --cwd "$BACKEND_DIR"

# Frontend
cd "$FRONTEND_DIR"

pm2 start npm \
    --name "$APP_NAME-frontend" \
    --cwd "$FRONTEND_DIR" \
    -- start -- -p "$FRONTEND_PORT"

pm2 save

pm2 startup systemd -u root --hp /root >/tmp/ultralive-pm2-startup.txt 2>&1 || true

STARTUP_CMD="$(grep -E '^sudo |^env ' /tmp/ultralive-pm2-startup.txt | tail -1 || true)"

if [[ -n "$STARTUP_CMD" ]]; then
    eval "$STARTUP_CMD" || true
fi

# ============================================================
# HTTPS
# ============================================================

if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then

    log "Configuring HTTPS"

    echo
    echo "Checking DNS for $DOMAIN ..."

    SERVER_IP="$(curl -4 -s https://api.ipify.org || true)"

    DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" |
        awk '{print $1}' |
        head -1 || true)"

    echo "Server IP : ${SERVER_IP:-unknown}"
    echo "Domain IP : ${DOMAIN_IP:-unknown}"

    if [[ -n "$DOMAIN_IP" && -n "$SERVER_IP" && "$DOMAIN_IP" == "$SERVER_IP" ]]; then

        certbot \
            --nginx \
            --non-interactive \
            --agree-tos \
            --redirect \
            -m "$EMAIL" \
            -d "$DOMAIN"

        # Re-write backend env because HTTPS changes cookie policy.
        sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' \
            "$BACKEND_DIR/.env"

        sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://$DOMAIN#" \
            "$BACKEND_DIR/.env"

        pm2 restart "$APP_NAME-backend"

    else

        echo
        echo "WARNING:"
        echo "DNS does not currently point to this server."
        echo "HTTPS was NOT automatically configured."
        echo
        echo "After DNS is correct, run:"
        echo
        echo "  certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect"
        echo

    fi

else

    echo
    echo "HTTPS was not configured."
    echo
    echo "To use automatic HTTPS:"
    echo "  DOMAIN=live.example.com EMAIL=you@example.com bash install.sh"
    echo

fi

# ============================================================
# Health checks
# ============================================================

log "Running health checks"

sleep 5

echo
echo "PM2:"
pm2 status

echo
echo "Listening ports:"
ss -lntup | grep -E \
    ":($BACKEND_PORT|$FRONTEND_PORT|$RTMP_PORT|$MEDIA_PORT|80|443)\b" \
    || true

echo
echo "Nginx:"
systemctl is-active nginx || true

echo
echo "MongoDB:"
docker ps --filter "name=$MONGO_CONTAINER"

# Backend health
echo
echo "Backend health:"

if curl -fsS "http://127.0.0.1:$BACKEND_PORT/api/site/settings" >/dev/null 2>&1; then
    echo "OK"
else
    echo "WARNING: Backend health endpoint did not respond."
fi

# Frontend
echo
echo "Frontend health:"

if curl -fsS "http://127.0.0.1:$FRONTEND_PORT" >/dev/null 2>&1; then
    echo "OK"
else
    echo "WARNING: Frontend did not respond."
fi

# ============================================================
# Final output
# ============================================================

SERVER_IP="$(hostname -I | awk '{print $1}')"

log "UltraLive installation completed"

echo
echo "============================================================"
echo " UltraLive"
echo "============================================================"
echo
echo "Server IP:"
echo "  $SERVER_IP"
echo
echo "Application:"
echo "  $APP_DIR"
echo
echo "Backend:"
echo "  http://127.0.0.1:$BACKEND_PORT"
echo
echo "Frontend:"
echo "  http://127.0.0.1:$FRONTEND_PORT"
echo
echo "RTMP:"
echo "  rtmp://SERVER_IP:$RTMP_PORT/live"
echo
echo "HLS:"
echo "  http://SERVER_IP/live/"
echo
echo "Owner:"
echo "  Username: $OWNER_USERNAME"
echo "  Password: $OWNER_PASSWORD"
echo
echo "Credentials saved to:"
echo "  /root/ultralive-owner.txt"
echo
echo "============================================================"

if [[ -n "$DOMAIN" ]]; then
    echo
    echo "Website:"
    echo "  http://$DOMAIN"
    echo
fi

if [[ "$LIVEKIT_ENABLED" != "true" ]]; then
    echo
    echo "LiveKit:"
    echo "  DISABLED"
    echo
    echo "The existing RTMP → HLS pipeline remains active."
    echo
fi

echo
echo "Useful commands:"
echo
echo "  pm2 status"
echo "  pm2 logs $APP_NAME-backend"
echo "  pm2 logs $APP_NAME-frontend"
echo "  docker logs $MONGO_CONTAINER"
echo
echo "============================================================"
