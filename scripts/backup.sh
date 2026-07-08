#!/usr/bin/env bash
# Nightly off-site backup for the workout-tracker SQLite DB.
# Runs on the Raspberry Pi HOST via cron (never inside the container).
set -euo pipefail

DB="${DB:-$HOME/workout-tracker/data/workouts.db}"
STAGE="${STAGE:-/tmp}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
APP="${APP:-http://127.0.0.1:8080}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$STAGE/workout-$STAMP.db"

heartbeat() { # $1 = event name, $2 = json props
  curl -fsS -m 10 -X POST "$APP/api/events" \
    -H 'Content-Type: application/json' \
    -d "[{\"name\":\"$1\",\"props\":$2}]" >/dev/null 2>&1 || true
}

start=$(date +%s)
if sqlite3 "$DB" "VACUUM INTO '$OUT'" \
   && rclone copy "$OUT" "$REMOTE" \
   && sqlite3 "$DB" "DELETE FROM events WHERE ts < datetime('now','-12 months')"; then
  bytes=$(stat -c%s "$OUT" 2>/dev/null || echo 0)  # GNU/Linux stat syntax only (Pi host is the only target)
  dur=$(( $(date +%s) - start ))
  heartbeat backup_completed "{\"bytes\":$bytes,\"remote\":\"$REMOTE\",\"duration_s\":$dur}"
else
  heartbeat backup_failed "{\"error\":\"backup.sh failed\"}"
  find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
  exit 1
fi

find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
