#!/usr/bin/env bash
# Backup for the workout-tracker SQLite DB. Runs daily from cron on the Raspberry Pi
# host (#422); it can still be run by hand. A run whose database fingerprint matches
# the newest snapshot writes no new file and records "skipped (unchanged)". Only the
# newest 2 local snapshots are kept; the off-site copy is best-effort.
# The snapshot (VACUUM INTO) is taken inside the container with `docker compose exec`
# and copied out with `docker cp`: the container runs as root, so the WAL sidecar
# files it creates cannot be opened by the host user. The image has Python but no
# sqlite3 CLI, so the in-container step uses the stdlib module.
set -euo pipefail

# Pin PATH so docker/rclone/curl resolve in a non-login shell.
# $HOME/.local/bin included: rclone is installed there as a static binary
# (no passwordless sudo on the Pi, so no apt / /usr/local/bin install).
# EXTRA_PATH is empty on the host; the tests use it to put fake docker/rclone first.
PATH="${EXTRA_PATH:+$EXTRA_PATH:}$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

COMPOSE_FILE="${COMPOSE_FILE:-$HOME/workout-tracker/docker-compose.yml}"
# shellcheck disable=SC2086  # intentional word-splitting: COMPOSE is a multi-word command
COMPOSE="docker compose -f $COMPOSE_FILE"
DB="${DB:-/app/data/workouts.db}"
# Where the app looks for the result — same directory as the DB, because that
# is the one path both sides already agree on (backend/main.py derives it from
# DATABASE_URL the same way). It is served by GET /api/admin/backup-status;
# scripts/deploy.sh, which has no session, reads this file directly.
STATUS="$(dirname "$DB")/backup-status.json"
# NOT /tmp: that's tmpfs, which wipes the local snapshots on every reboot.
STAGE="${STAGE:-$HOME/backups}"
REMOTE="${REMOTE:-gdrive:workout-tracker-backups}"
# Empty = keep every off-site snapshot. Deliberate: the DB is ~185 KB, so a
# year of weeklies is ~10 MB. Set e.g. REMOTE_KEEP_DAYS=180 to prune old ones.
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-}"
# Optional independent heartbeat (e.g. a healthchecks.io ping URL). Unused: #89
# was closed because there was no schedule to alarm against. There is one again
# since #422, so wiring an external check is now a one-line change. Until then
# the result is: non-zero exit, stderr, and last_backup_status from
# /api/admin/backup-status, which reports "failed" immediately, "skipped
# (unchanged)" when nothing changed, or "stale" once the last run is more than
# about 2 days old (the schedule stopped). Nothing fails a deploy over it. Note
# that last_backup_status is the LOCAL leg only; the off-site one is reported
# separately as last_backup_remote_status and never fails the run (#93).
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
CTMP="/tmp/workout-$STAMP.db"
# A cheap content fingerprint of the live database (the file is ~170 KB), printed
# by Python inside the container. It is part of each snapshot's file name, so the
# newest snapshot always carries the fingerprint it was taken at.
FINGERPRINT_PY='import hashlib, sqlite3, sys
h = hashlib.sha256()
for line in sqlite3.connect(sys.argv[1]).iterdump():
    h.update(line.encode())
print(h.hexdigest()[:16])'

mkdir -p "$STAGE"

# Always remove the in-container temp snapshot, even when docker cp fails
# mid-chain (it used to linger in the container's /tmp until a restart).
cleanup_ctmp() { $COMPOSE exec -T workout-tracker rm -f "$CTMP" >/dev/null 2>&1 || true; }
trap cleanup_ctmp EXIT

# The status file must land in the data volume, but ~/workout-tracker/data on the host
# is root-owned (Docker created it) and the host user (docker group, no sudo) cannot
# write there. So stage the JSON in a host temp file and let `docker cp` place it.
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
fp=$($COMPOSE exec -T workout-tracker python -c "$FINGERPRINT_PY" "$DB") || fp=""
latest=$(ls -1 "$STAGE"/workout-*.db 2>/dev/null | sort | tail -n 1) || latest=""
latest_fp="${latest%.db}"; latest_fp="${latest_fp##*-}"
# Ordering is load-bearing: rclone runs only after the snapshot is on the host's
# disk (docker cp). That is why the local copies stayed current all through the
# Google Drive outage of 2026-09-01..03 — the first two steps kept succeeding
# while the third failed. Don't reorder it.
mode=failed
if [ -z "$fp" ]; then
  :
elif [ -n "$latest" ] && [ "$latest_fp" = "$fp" ]; then
  mode=skipped
  OUT="$latest"
else
  OUT="$STAGE/workout-$STAMP-$fp.db"
  if $COMPOSE exec -T workout-tracker python -c "import sqlite3; sqlite3.connect('$DB').execute(\"VACUUM INTO '$CTMP'\")" \
     && cid=$($COMPOSE ps -q workout-tracker) \
     && docker cp "$cid:$CTMP" "$OUT"; then
    mode=ok
  fi
fi

if [ "$mode" != failed ]; then
  bytes=$(wc -c < "$OUT" | tr -d ' ')
  dur=$(( $(date +%s) - start ))
  if [ "$mode" = skipped ]; then
    local_status="skipped (unchanged)"
  else
    local_status="ok"
  fi
  local_json="{\"status\":\"$local_status\",\"at\":\"$(now_utc)\",\"bytes\":$bytes,\"duration_s\":$dur}"
  status=0
  # The off-site leg is reported on its own because it fails on its own: the
  # snapshot is already on the host's disk by now, and that copy is the one
  # standing between us and data loss. Calling the whole run failed because
  # Drive was unreachable is what taught us to stop reading the signal — four
  # such nights in a row, 2026-09-01..04 (#93). So a broken rclone leg is
  # recorded and visible in /api/admin/backup-status, but it does not fail the run.
  # It also runs when the local leg was skipped: copying a file Drive already
  # has is a no-op, and it retries an upload that failed on an earlier day.
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
  local_json="{\"status\":\"failed\",\"at\":\"$(now_utc)\",\"error\":\"fingerprint, snapshot or docker cp failed\"}"
  # "Never tried" has to stay distinguishable from "tried and broke", which is
  # why this branch records a leg it never ran rather than leaving it out.
  remote_json="{\"status\":\"skipped\",\"at\":\"$(now_utc)\"}"
  status=1
fi

# No `|| true` here on purpose: the old heartbeat swallowed its own failures by
# construction, so a backup whose result never reached the status file looked
# identical to one that never ran. A backup nobody can see the result of is not
# a finished backup — say so in the exit status.
if ! write_status "{\"local\":$local_json,\"remote\":$remote_json}"; then
  if [ "$status" -ne 0 ]; then
    echo "backup.sh: the failure above could not be recorded for the app either" >&2
  fi
  status=1
fi

if [ "$status" -eq 0 ]; then ping_external ""; else ping_external "/fail"; fi

# Housekeeping — best-effort and OUTSIDE the success chain: a prune hiccup must
# not flag a good backup as failed, and a Drive outage must not skip it.
$COMPOSE exec -T workout-tracker python -c "import sqlite3; c = sqlite3.connect('$DB'); c.execute(\"DELETE FROM events WHERE ts < datetime('now','-12 months')\"); c.commit(); c.close()" >/dev/null 2>&1 || true
# Keep the newest 2 local snapshots (#422). The names sort by timestamp, and the
# old manual-era names (no fingerprint) sort with them.
ls -1 "$STAGE"/workout-*.db 2>/dev/null | sort -r | tail -n +3 \
  | while read -r old; do rm -f "$old"; done || true

exit $status
