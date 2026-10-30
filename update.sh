#!/usr/bin/env bash
# Safe in-place update: DB backup -> pull -> install -> build in a side directory -> swap -> reload.
# The running site is untouched until the new build succeeded; on any failure the old version stays/returns.
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$APP_DIR/unlimited-stream-backend"; FRONT="$APP_DIR/unlimited-stream-front"
STATUS="$APP_DIR/.update-status.json"
status() { printf '{"state":"%s","message":"%s","at":"%s"}\n' "$1" "$2" "$(date -u +%FT%TZ)" > "$STATUS"; }
cd "$APP_DIR"
PREV="$(git rev-parse HEAD)"; BRANCH="$(git rev-parse --abbrev-ref HEAD)"
rollback() {
  echo "✖ Update failed; rolling back to the previous version..."
  git reset --hard "$PREV" >/dev/null 2>&1 || true
  [[ -d "$FRONT/.next.old" ]] && { rm -rf "$FRONT/.next"; mv "$FRONT/.next.old" "$FRONT/.next"; }
  (cd "$BACKEND" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1) || true
  pm2 reload "$APP_DIR/ecosystem.config.js" >/dev/null 2>&1 || true
  status failed "Update failed and the previous version was restored."
}
trap 'rollback' ERR

status running "Backing up the database"
echo "▶ Pre-update backup"
mkdir -p "$APP_DIR/backups"
(cd "$BACKEND" && node scripts/backup.js "$APP_DIR/backups/pre-update-$(date +%Y%m%d-%H%M%S).tar.gz")
ls -1t "$APP_DIR"/backups/pre-update-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

status running "Fetching the new version"
echo "▶ git pull"
git fetch --quiet origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"
NEW="$(git rev-parse --short HEAD)"

status running "Installing dependencies"
echo "▶ npm ci"
(cd "$BACKEND" && npm ci --omit=dev --no-audit --no-fund)
(cd "$FRONT" && npm ci --no-audit --no-fund)

status running "Building the UI (the site stays available)"
echo "▶ build (in a side directory)"
rm -rf "$FRONT/.next-build"
(cd "$FRONT" && NEXT_DIST_DIR=.next-build npm run build)

status running "Swapping and reloading"
echo "▶ swap + reload"
rm -rf "$FRONT/.next.old"
[[ -d "$FRONT/.next" ]] && mv "$FRONT/.next" "$FRONT/.next.old"
mv "$FRONT/.next-build" "$FRONT/.next"
pm2 reload "$APP_DIR/ecosystem.config.js" --update-env

echo "▶ health check"
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:5050/api/health >/dev/null 2>&1 && ok=1 && break; sleep 2; done
[[ "${ok:-0}" == "1" ]] || false
rm -rf "$FRONT/.next.old"
trap - ERR
status done "Updated to ${NEW}."
echo "✅ Update complete: ${NEW}"
