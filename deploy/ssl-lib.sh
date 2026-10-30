#!/usr/bin/env bash
# Shared by install.sh and the `ultralive` CLI: nginx site + TLS certificates (domain or bare IP).
# Expects: HOST (domain or IP). Sets: SSL_MODE, SSL_CERT, SSL_KEY.

UL_SSL_DIR="${UL_SSL_DIR:-/etc/ultralive-ssl}"
UL_WEBROOT="${UL_WEBROOT:-/var/www/letsencrypt}"
UL_CERTBOT="${UL_CERTBOT:-/opt/certbot/bin/certbot}"
UL_NGINX_SITE="${UL_NGINX_SITE:-/etc/nginx/sites-available/ultralive}"
UL_LOG="${UL_LOG:-/var/log/ultralive-install.log}"

ul_is_ip() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

ul_write_nginx() {
  local HOST="$1" cert="$2" key="$3"
  cat > "$UL_NGINX_SITE" <<EOF
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
  ln -sf "$UL_NGINX_SITE" "$(dirname "$(dirname "$UL_NGINX_SITE")")/sites-enabled/ultralive"
  rm -f "$(dirname "$(dirname "$UL_NGINX_SITE")")/sites-enabled/default"
  nginx -t && systemctl reload nginx
}

ul_self_signed() {
  local host="$1" san
  mkdir -p "$UL_SSL_DIR"
  SSL_MODE="self-signed"; SSL_CERT="$UL_SSL_DIR/selfsigned.crt"; SSL_KEY="$UL_SSL_DIR/selfsigned.key"
  if ul_is_ip "$host"; then san="IP:${host}"; else san="DNS:${host}"; fi
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 -keyout "$SSL_KEY" -out "$SSL_CERT" -subj "/CN=${host}" -addext "subjectAltName=${san}" 2>/dev/null
}

# Let's Encrypt IP-address certificates need certbot >= 5.4 (distro/snap packages are often older),
# so certbot is installed into its own virtualenv from PyPI.
ul_install_certbot() {
  local have=""
  [[ -x "$UL_CERTBOT" ]] && have="$("$UL_CERTBOT" --version 2>/dev/null | awk '{print $2}')"
  if [[ -n "$have" && "$(printf '%s\n5.4.0\n' "$have" | sort -V | head -1)" == "5.4.0" ]]; then return 0; fi
  echo "Installing certbot (latest) ..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv python3-pip >/dev/null
  python3 -m venv "$(dirname "$(dirname "$UL_CERTBOT")")"
  "$(dirname "$UL_CERTBOT")/pip" install -q --upgrade pip certbot
  "$UL_CERTBOT" --version 2>/dev/null
  have="$("$UL_CERTBOT" --version 2>/dev/null | awk '{print $2}')"
  if [[ "$(printf '%s\n5.4.0\n' "$have" | sort -V | head -1)" != "5.4.0" ]]; then
    echo "WARNING: certbot $have is older than 5.4 — Let's Encrypt IP-address certificates will not work (domains still do). Python 3.10+ is needed."
  fi
}

# ul_obtain_cert HOST EMAIL  -> 0 and SSL_* set on success; prints certbot's real error otherwise.
ul_obtain_cert() {
  local host="$1" email="$2" out rc
  local existing="/etc/letsencrypt/live/${host}/fullchain.pem"
  if [[ -f "$existing" ]]; then SSL_MODE="letsencrypt"; SSL_CERT="$existing"; SSL_KEY="/etc/letsencrypt/live/${host}/privkey.pem"; return 0; fi
  local args=(certonly --webroot -w "$UL_WEBROOT" --non-interactive --agree-tos --deploy-hook "systemctl reload nginx")
  if [[ -n "$email" ]]; then args+=(-m "$email"); else args+=(--register-unsafely-without-email); fi
  if ul_is_ip "$host"; then args+=(--preferred-profile shortlived --ip-address "$host"); else args+=(-d "$host"); fi
  mkdir -p "$UL_WEBROOT/.well-known/acme-challenge"
  # `trap - ERR`: a failing certbot is an expected outcome here, not an installer crash
  if out="$(trap - ERR; "$UL_CERTBOT" "${args[@]}" 2>&1)"; then rc=0; else rc=$?; fi
  echo "$out" >> "$UL_LOG"
  if [[ $rc -eq 0 && -f "$existing" ]]; then SSL_MODE="letsencrypt"; SSL_CERT="$existing"; SSL_KEY="/etc/letsencrypt/live/${host}/privkey.pem"; return 0; fi
  echo "certbot failed:"; echo "$out" | tail -12
  return 1
}

# Short-lived (6 day) IP certificates must renew often; certbot only renews what is due.
ul_setup_renewal() {
  cat > /etc/cron.d/ultralive-certbot <<EOF
17 */8 * * * root $UL_CERTBOT renew --quiet --deploy-hook "systemctl reload nginx"
EOF
  chmod 644 /etc/cron.d/ultralive-certbot
}
