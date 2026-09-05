#!/usr/bin/env bash
# Off-site backup for the workout-tracker SQLite DB. Run by hand, when you want
# one — there is no cron for this any more (removed 2026-09-04; the app isn't
# used enough to justify a schedule). Everything below still assumes it runs on
# the Raspberry Pi HOST.
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
# Where /api/health looks for the result — same directory as the DB, because
# that is the one path both sides already agree on (backend/main.py derives it
# from DATABASE_URL the same way).
STATUS="$(dirname "$DB")/backup-status.json"
# NOT /tmp: that's tmpfs, which wipes the 90-day local retention on every reboot.
STAGE="${STAGE:-$HOME/backups}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
# Empty = keep every off-site snapshot. Deliberate: the DB is ~185 KB, so a
# year of weeklies is ~10 MB. Set e.g. REMOTE_KEEP_DAYS=180 to prune old ones.
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-}"
# Optional independent heartbeat (e.g. a healthchecks.io ping URL). Unused, and
# deliberately so: that kind of receiver alarms when a ping fails to arrive on
# schedule, and a manual backup has no schedule to be late against, so it would
# simply fire forever (see #89). Left in place because reinstating a cron plus
# an external check later is then a two-line change. Running this by hand tells
# you the result directly — non-zero exit, stderr, and last_backup_status in
# /api/health, which reports "failed" immediately or "stale" once an "ok" is
# more than 8 days old. That 8 days is now a "it's been a while" nudge rather
# than a missed-schedule alarm; nothing fails a deploy over it. Note that
# last_backup_status is the LOCAL leg only; the off-site one is reported
# separately as last_backup_remote_status and never fails the run (#93).
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$STAGE/workout-$STAMP.db"
CTMP="/tmp/workout-$STAMP.db"

mkdir -p "$STAGE"

# Always remove the in-container temp snapshot, even when docker cp fails
# mid-chain (it used to linger in the container's /tmp until a restart).
cleanup_ctmp() { $COMPOSE exec -T workout-tracker rm -f "$CTMP" >/dev/null 2>&1 || true; }
trap cleanup_ctmp EXIT

# Records the result where /api/health reads it. Same shape of problem as the
# VACUUM above, from the other direction: the status file has to land inside
# the data volume, but ~/workout-tracker/data on the host is drwxr-xr-x root
# root — Docker created it when it first mounted the volume — and the cron user
# (kapekost, docker group, no passwordless sudo) is denied when it writes there
# directly. So stage the JSON in a host temp file the cron user does own and
# let `docker cp` place it: that runs as the Docker daemon, writes through the
# bind mount onto the host filesystem, and the file even lands owned by the
# host user. Verified on the Pi, 2026-09-04.
# `ps -aq`, not `ps -q`: docker cp works against a *stopped* container, so
# "the backup failed because the app was down" — precisely the case the old
# HTTP heartbeat could never report, since it POSTed to the app itself — still
# gets recorded and shows up the moment the container comes back.
write_status() { # $1 = the JSON body
  local tmp rc cid
  tmp="/tmp/backup-status-$STAMP.json"
  rc=0
  if ! printf '%s\n' "$1" > "$tmp" 2>/dev/null; then
    echo "backup.sh: could not stage the status file at $tmp" >&2
    rc=1
  elif ! cid=$($COMPOSE ps -aq workout-tracker 2>/dev/null) || [ -z "$cid" ]; then
    echo "backup.sh: no workout-tracker container to write $STATUS into" >&2
    rc=1
  elif ! docker cp "$tmp" "$cid:$STATUS" >/dev/null 2>&1; then
    echo "backup.sh: docker cp of the status file into $cid failed" >&2
    rc=1
  fi
  rm -f "$tmp"
  return $rc
}

ping_external() { # $1 = "" on success, "/fail" on failure
  if [ -n "$HEARTBEAT_URL" ]; then
    curl -fsS -m 10 "$HEARTBEAT_URL$1" >/dev/null 2>&1 || true
  fi
}

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

start=$(date +%s)
# Ordering is load-bearing: rclone runs only after docker cp has put the
# snapshot on the host's disk. That is why the local copies stayed current all
# through the Google Drive outage of 2026-09-01..03 — the first two steps kept
# succeeding while the third failed. Don't reorder it.
if $COMPOSE exec -T workout-tracker python -c "import sqlite3; sqlite3.connect('$DB').execute(\"VACUUM INTO '$CTMP'\")" \
   && cid=$($COMPOSE ps -q workout-tracker) \
   && docker cp "$cid:$CTMP" "$OUT"; then
  bytes=$(stat -c%s "$OUT" 2>/dev/null || echo 0)  # GNU/Linux stat syntax only (Pi host is the only target)
  dur=$(( $(date +%s) - start ))
  local_json="{\"status\":\"ok\",\"at\":\"$(now_utc)\",\"bytes\":$bytes,\"duration_s\":$dur}"
  status=0
  # The off-site leg is reported on its own because it fails on its own: the
  # snapshot is already on the host's disk by now, and that copy is the one
  # standing between us and data loss. Calling the whole run failed because
  # Drive was unreachable is what taught us to stop reading the signal — four
  # such nights in a row, 2026-09-01..04 (#93). So a broken rclone leg is
  # recorded and visible in /api/health, but it does not fail the run.
  if rclone copy "$OUT" "$REMOTE"; then
    remote_json="{\"status\":\"ok\",\"at\":\"$(now_utc)\",\"remote\":\"$REMOTE\"}"
    if [ -n "$REMOTE_KEEP_DAYS" ]; then
      rclone delete --min-age "${REMOTE_KEEP_DAYS}d" "$REMOTE" >/dev/null 2>&1 || true
    fi
  else
    remote_json="{\"status\":\"failed\",\"at\":\"$(now_utc)\",\"remote\":\"$REMOTE\",\"error\":\"rclone copy failed\"}"
    echo "backup.sh: the snapshot is safe at $OUT, but copying it to $REMOTE failed" >&2
  fi
else
  local_json="{\"status\":\"failed\",\"at\":\"$(now_utc)\",\"error\":\"snapshot or docker cp failed\"}"
  # "Never tried" has to stay distinguishable from "tried and broke", which is
  # why this branch records a leg it never ran rather than leaving it out.
  remote_json="{\"status\":\"skipped\",\"at\":\"$(now_utc)\"}"
  status=1
fi

# No `|| true` here on purpose: the old heartbeat swallowed its own failures by
# construction, so a backup whose result never reached /api/health looked
# identical to one that never ran. A backup nobody can see the result of is not
# a finished backup — say so in the exit status.
if ! write_status "{\"local\":$local_json,\"remote\":$remote_json}"; then
  if [ "$status" -ne 0 ]; then
    echo "backup.sh: the failure above could not be recorded for /api/health either" >&2
  fi
  status=1
fi

if [ "$status" -eq 0 ]; then ping_external ""; else ping_external "/fail"; fi

# Housekeeping — best-effort and OUTSIDE the success chain: a prune hiccup must
# not flag a good backup as failed, and a Drive outage must not skip it.
$COMPOSE exec -T workout-tracker python -c "import sqlite3; c = sqlite3.connect('$DB'); c.execute(\"DELETE FROM events WHERE ts < datetime('now','-12 months')\"); c.commit(); c.close()" >/dev/null 2>&1 || true
# Keep roughly the last quarter of whatever you happened to run. With manual
# backups there is no cadence to size this against, and the DB is ~170 KB, so
# an age-based prune is only here to stop the directory growing without bound.
# The Pi is deliberately kept to a couple of snapshots by hand (2026-09-04);
# this is the backstop, not the policy.
find "$STAGE" -name 'workout-*.db' -mtime +90 -delete 2>/dev/null || true

exit $status
