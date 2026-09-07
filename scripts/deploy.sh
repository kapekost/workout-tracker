#!/usr/bin/env bash
# Build, transfer, restart, and verify the workout-tracker deployment.
#
# Host-specific values are intentionally kept out of git. Add this block to
# AGENTS.local.md (the real, gitignored deployment notes):
#
#   ## Scripted deploy configuration
#   DEPLOY_HOST=pi.example
#   DEPLOY_APP_DIR=/home/user/workout-tracker
#   DEPLOY_SSH_OPTS='-o BatchMode=yes'
#
# DEPLOY_HOST and DEPLOY_APP_DIR are required. DEPLOY_SSH_OPTS is optional.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DOC="$ROOT/AGENTS.local.md"

if [[ ! -f "$LOCAL_DOC" ]]; then
  echo "error: AGENTS.local.md is required for deployment-specific settings (see AGENTS.local.md.example)" >&2
  exit 1
fi

# Read only the explicitly documented shell assignments from the local file,
# scoped to the one section — never a blind eval of the whole (prose) file.
# The file is trusted local configuration and is never committed.
eval "$(sed -n '/^## Scripted deploy configuration$/,/^## /p' "$LOCAL_DOC" \
  | sed -n '/^DEPLOY_HOST=/p; /^DEPLOY_APP_DIR=/p; /^DEPLOY_SSH_OPTS=/p')"

: "${DEPLOY_HOST:?AGENTS.local.md must define DEPLOY_HOST under '## Scripted deploy configuration'}"
: "${DEPLOY_APP_DIR:?AGENTS.local.md must define DEPLOY_APP_DIR under '## Scripted deploy configuration'}"
DEPLOY_SSH_OPTS="${DEPLOY_SSH_OPTS:-}"

short_sha="$(git -C "$ROOT" rev-parse --short HEAD)"
image="kapekost/workout-tracker"
local_tag="$image:$short_sha"

# Keep the deployment stamp tied to a clean commit. Refuse to build a dirty
# tree so /api/health and the UI footer can't claim a source state that was
# never actually committed.
if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "error: working tree is dirty; commit changes before deploying" >&2
  exit 1
fi

# Warn, never fail: mail config missing only means invites and resets cannot
# send, which must not block deploying everything else. Checked before the build
# so the warning is visible rather than buried under image transfer output.
# shellcheck disable=SC2086
if ! ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" "grep -qs '^RESEND_API_KEY=re_' '$DEPLOY_APP_DIR/.env'"; then
  echo "warning: $DEPLOY_APP_DIR/.env on $DEPLOY_HOST has no RESEND_API_KEY."
  echo "         Invite and password-reset emails will not send. See .env.example."
fi

echo "==> building $local_tag for linux/arm64"
docker buildx build \
  --platform linux/arm64 \
  --build-arg "APP_COMMIT=$short_sha" \
  -t "$local_tag" \
  --load \
  "$ROOT"

echo "==> transferring image to $DEPLOY_HOST"
# shellcheck disable=SC2086  # intentional word-splitting: DEPLOY_SSH_OPTS may hold multiple -o flags
docker save "$local_tag" \
  | gzip \
  | ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" 'gunzip | docker load'

echo "==> restarting service"
# The deploy target supplies its own docker-compose.yml, from its own clone of
# this repo, so that clone has to be current before compose runs. The tag to
# start is taken from APP_COMMIT (`image: ...:${APP_COMMIT:?...}`, required
# since #126), and a clone predating that fix still pins the old
# `${APP_COMMIT:-latest}` fallback — which silently re-creates whatever
# `:latest` happens to resolve to instead of failing loudly, leaving the
# verification below to fail with a version mismatch that looks like a build
# problem rather than a stale clone.
# --ff-only so a diverged clone halts the deploy loudly rather than quietly
# merging on the target.
# shellcheck disable=SC2086
ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" \
  "cd '$DEPLOY_APP_DIR' \
     && git pull --ff-only \
     && APP_COMMIT='$short_sha' docker compose up -d --force-recreate workout-tracker"

echo "==> verifying /api/health"
# --force-recreate returns as soon as the container starts, not once uvicorn is
# actually accepting connections, so an immediate curl can race a good deploy.
# Retry inside the one SSH session below rather than one new connection per
# attempt: a fresh SSH handshake+auth per retry would both add its own latency
# on top of the wait (undermining the ~30s budget) and make the timing this
# error message claims a lie.
# shellcheck disable=SC2086
if ! health="$(ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" '
  for attempt in $(seq 1 15); do
    if health="$(curl -fsS http://127.0.0.1:8080/api/health)"; then
      echo "$health"
      exit 0
    fi
    echo "    (not ready yet, attempt $attempt/15, retrying in 2s)" >&2
    sleep 2
  done
  exit 1
')"; then
  echo "error: /api/health never responded within ~30s of restart" >&2
  exit 1
fi

python3 - "$health" "$short_sha" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
expected = sys.argv[2]
actual = payload.get("version")

if actual != expected:
    raise SystemExit(
        f"deployment verification failed: /api/health version={actual!r}, expected={expected!r}"
    )

print(f"verified: version={actual}")
PY

# The backup posture used to arrive in that same payload. #86 trimmed
# /api/health to {status, version} and moved the four last_backup_* keys to
# GET /api/admin/backup-status, which needs an admin session — and this script
# has none by design, since it runs where no browser has ever logged in.
#
# So read the file the app reads, straight off the host, and print it as it
# stands. Never fatal: a chronically broken off-site leg was always a warning
# here, never a reason to refuse a deploy, and forcing a backup before every
# deploy once a week had passed would be worse than the problem. Printed raw
# rather than interpreted, because "ok older than 8 days is stale" is a rule
# that has already had to move once (#89) and a second copy of it living here
# would be the copy nobody remembers to update.
echo "==> last backup, as recorded on the host"
# shellcheck disable=SC2086
if ! ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" \
     "cat '$DEPLOY_APP_DIR/data/backup-status.json'" 2>/dev/null | sed 's/^/    /'; then
  echo "    (no status file yet — backups are manual; see docs/BACKUPS.md)"
fi
echo "    for the interpreted view: GET /api/admin/backup-status, as an admin"

echo "==> deploy verified: $short_sha"
