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
# $HOME/.local/bin included: rclone is installed there as a static binary
# (no passwordless sudo on the Pi, so no apt / /usr/local/bin install).
PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

COMPOSE_FILE="${COMPOSE_FILE:-$HOME/workout-tracker/docker-compose.yml}"
# shellcheck disable=SC2086  # intentional word-splitting: COMPOSE is a multi-word command
COMPOSE="docker compose -f $COMPOSE_FILE"
DB="${DB:-/app/data/workouts.db}"
# NOT /tmp: that's tmpfs, which wipes the 14-day local retention on every reboot.
STAGE="${STAGE:-$HOME/backups}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
# Empty = keep every off-site snapshot. Deliberate: the DB is ~45 KB, so a year
# of nightlies is ~16 MB. Set e.g. REMOTE_KEEP_DAYS=180 to prune old ones.
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-}"
APP="${APP:-http://127.0.0.1:8080}"
# Optional independent heartbeat (e.g. a healthchecks.io ping URL). The in-app
# heartbeat below is unreachable exactly when the likeliest failure happens —
# the container being down — so an external receiver is the only way a failure
# gets actively noticed. Until one is set, staleness of last_backup_at is the
# signal (/api/health reports last_backup_status "stale" after 26h).
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$STAGE/workout-$STAMP.db"
CTMP="/tmp/workout-$STAMP.db"

mkdir -p "$STAGE"

# Always remove the in-container temp snapshot, even when docker cp fails
# mid-chain (it used to linger in the container's /tmp until a restart).
cleanup_ctmp() { $COMPOSE exec -T workout-tracker rm -f "$CTMP" >/dev/null 2>&1 || true; }
trap cleanup_ctmp EXIT

heartbeat() { # $1 = event name, $2 = json props
  curl -fsS -m 10 -X POST "$APP/api/events" \
    -H 'Content-Type: application/json' \
    -d "[{\"name\":\"$1\",\"props\":$2}]" >/dev/null 2>&1 || true
}

ping_external() { # $1 = "" on success, "/fail" on failure
  if [ -n "$HEARTBEAT_URL" ]; then
    curl -fsS -m 10 "$HEARTBEAT_URL$1" >/dev/null 2>&1 || true
  fi
}

start=$(date +%s)
if $COMPOSE exec -T workout-tracker python -c "import sqlite3; sqlite3.connect('$DB').execute(\"VACUUM INTO '$CTMP'\")" \
   && cid=$($COMPOSE ps -q workout-tracker) \
   && docker cp "$cid:$CTMP" "$OUT" \
   && rclone copy "$OUT" "$REMOTE"; then
  bytes=$(stat -c%s "$OUT" 2>/dev/null || echo 0)  # GNU/Linux stat syntax only (Pi host is the only target)
  dur=$(( $(date +%s) - start ))
  heartbeat backup_completed "{\"bytes\":$bytes,\"remote\":\"$REMOTE\",\"duration_s\":$dur}"
  ping_external ""
  if [ -n "$REMOTE_KEEP_DAYS" ]; then
    rclone delete --min-age "${REMOTE_KEEP_DAYS}d" "$REMOTE" >/dev/null 2>&1 || true
  fi
  status=0
else
  heartbeat backup_failed "{\"error\":\"backup.sh failed\"}"
  ping_external "/fail"
  status=1
fi

# Housekeeping — best-effort and OUTSIDE the success chain: a prune hiccup must
# not flag a good backup as failed, and a Drive outage must not skip it.
$COMPOSE exec -T workout-tracker python -c "import sqlite3; c = sqlite3.connect('$DB'); c.execute(\"DELETE FROM events WHERE ts < datetime('now','-12 months')\"); c.commit(); c.close()" >/dev/null 2>&1 || true
find "$STAGE" -name 'workout-*.db' -mtime +14 -delete 2>/dev/null || true

exit $status
