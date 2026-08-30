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
# shellcheck disable=SC2086
ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" \
  "cd '$DEPLOY_APP_DIR' && APP_COMMIT='$short_sha' docker compose up -d --force-recreate workout-tracker"

echo "==> verifying /api/health"
# shellcheck disable=SC2086
health="$(ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" \
  "curl -fsS http://127.0.0.1:8080/api/health")"

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

if payload.get("last_backup_status") == "stale":
    raise SystemExit("deployment verification failed: last_backup_status is stale")

print(f"verified: version={actual}, last_backup_status={payload.get('last_backup_status')}")
PY

echo "==> deploy verified: $short_sha"
