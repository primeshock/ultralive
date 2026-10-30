#!/usr/bin/env bash
# Capacity tuning for hundreds of simultaneous viewers. Idempotent; sourced by install.sh and `ultralive tune`.
# Defaults (Ubuntu): nginx = 768 connections/worker and 1024 open files per process, which a 300-person class
# (each viewer holds a chat socket + a LiveKit signalling socket + HTTP requests) exhausts.

ul_tune_system() {
  local conf=/etc/nginx/nginx.conf
  if [[ -f "$conf" ]]; then
    cp -n "$conf" "${conf}.ultralive-backup" 2>/dev/null || true
    grep -q '^worker_rlimit_nofile' "$conf" || sed -i '1i worker_rlimit_nofile 65535;' "$conf"
    sed -i 's/worker_connections [0-9]*;/worker_connections 8192;/' "$conf"
    cat > /etc/nginx/conf.d/ultralive-tuning.conf <<'NGX'
# keep static/JSON responses small; websocket + video traffic is unaffected
gzip_vary on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_types text/css application/javascript application/json image/svg+xml text/plain;
NGX
    if ! nginx -t >/dev/null 2>&1; then
      # a distro that already defines these directives: drop ours instead of breaking the site
      rm -f /etc/nginx/conf.d/ultralive-tuning.conf
      nginx -t >/dev/null 2>&1 || { cp "${conf}.ultralive-backup" "$conf"; echo "nginx tuning reverted (config test failed)"; return 1; }
    fi
    systemctl reload nginx 2>/dev/null || true
  fi

  # Node (pm2) must be allowed many more open sockets than the default 1024.
  mkdir -p /etc/systemd/system/pm2-root.service.d
  printf '[Service]\nLimitNOFILE=65535\n' > /etc/systemd/system/pm2-root.service.d/ultralive.conf
  systemctl daemon-reload 2>/dev/null || true

  # UDP buffers recommended by LiveKit; larger accept queues for connection bursts at class start.
  cat > /etc/sysctl.d/99-ultralive.conf <<'SYS'
fs.file-max = 200000
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.core.rmem_max = 7500000
net.core.wmem_max = 7500000
SYS
  sysctl --system >/dev/null 2>&1 || true
  echo "System tuned (nginx 8192 connections, 65535 open files, larger UDP buffers)."
}
