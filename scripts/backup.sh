#!/usr/bin/env bash
# Nightly off-site backup for the workout-tracker SQLite DB.
# Runs on the Raspberry Pi HOST via cron, but the DB snapshot (VACUUM INTO) is
# taken INSIDE the container via `docker compose exec`, then copied out with
# `docker cp`. Why: the app container runs as root and switches the DB to WAL
# mode, which produces root-owned `-shm`/`-wal` sidecar files that the host
# cron user (kapekost — docker group, no sudo) cannot open directly. Also,
# python:3.11-slim has no `sqlite3` CLI — but it does have Python, so the
# in-container step uses the stdlib `sqlite3` module instead.
set -euo pipefail

# cron runs with a minimal environment — pin PATH so docker/rclone/curl resolve.
PATH=/usr/local/bin:/usr/bin:/bin

COMPOSE_FILE="${COMPOSE_FILE:-$HOME/workout-tracker/docker-compose.yml}"
# shellcheck disable=SC2086  # intentional word-splitting: COMPOSE is a multi-word command
COMPOSE="docker compose -f $COMPOSE_FILE"
DB="${DB:-/app/data/workouts.db}"
STAGE="${STAGE:-/tmp}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
APP="${APP:-http://127.0.0.1:8080}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$STAGE/workout-$STAMP.db"
CTMP="/tmp/workout-$STAMP.db"

heartbeat() { # $1 = event name, $2 = json props
  curl -fsS -m 10 -X POST "$APP/api/events" \
    -H 'Content-Type: application/json' \
    -d "[{\"name\":\"$1\",\"props\":$2}]" >/dev/null 2>&1 || true
}

start=$(date +%s)
if $COMPOSE exec -T workout-tracker python -c "import sqlite3; sqlite3.connect('$DB').execute(\"VACUUM INTO '$CTMP'\")" \
   && cid=$($COMPOSE ps -q workout-tracker) \
   && docker cp "$cid:$CTMP" "$OUT" \
   && $COMPOSE exec -T workout-tracker rm "$CTMP" \
   && rclone copy "$OUT" "$REMOTE" \
   && $COMPOSE exec -T workout-tracker python -c "import sqlite3; c = sqlite3.connect('$DB'); c.execute(\"DELETE FROM events WHERE ts < datetime('now','-12 months')\"); c.commit(); c.close()"; then
  bytes=$(stat -c%s "$OUT" 2>/dev/null || echo 0)  # GNU/Linux stat syntax only (Pi host is the only target)
  dur=$(( $(date +%s) - start ))
  heartbeat backup_completed "{\"bytes\":$bytes,\"remote\":\"$REMOTE\",\"duration_s\":$dur}"
else
  heartbeat backup_failed "{\"error\":\"backup.sh failed\"}"
  find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
  exit 1
fi

find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true
