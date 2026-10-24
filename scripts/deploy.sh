#!/usr/bin/env bash
# Build, transfer, restart, and verify the workout-tracker deployment.
#
# Host-specific values are intentionally kept out of git. Add this block to
# AGENTS.local.md (the real, gitignored deployment notes):
#
#   ## Scripted deploy configuration
#   DEPLOY_HOST=pi.example
#   DEPLOY_APP_DIR=/home/user/workout-tracker
#   DEPLOY_SSH_OPTS='-o ConnectTimeout=10'
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
if [[ "$DEPLOY_SSH_OPTS" == *BatchMode* ]]; then
  echo "error: DEPLOY_SSH_OPTS must not set BatchMode; it blocks the passphrase prompt and reads as a publickey denial." >&2
  exit 1
fi

# A warning, not an error: the key may still come from a keychain or a prompt in
# an interactive terminal. With neither, ssh fails later with a misleading
# "Permission denied (publickey)".
if ! ssh-add -l >/dev/null 2>&1; then
  echo "warning: ssh-add -l shows no key loaded in the agent. If the ssh steps below fail with" >&2
  echo "         'Permission denied (publickey)', run ssh-add in this terminal and retry." >&2
fi

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

# Refuse to deploy a branch that is behind main. A dirty-tree check is not
# enough: a feature branch 59 commits behind main is a perfectly *clean* tree,
# so on 2026-10-03 it passed the gate above and replaced the running app with
# an older build, silently removing Login, SetPassword and VersionBadge. Nothing
# in this script looked at the branch relationship, and /api/health reported
# "ok" the whole time because the app it served was healthy — just old.
#
# The base ref is resolved to whatever this clone actually has, and if NEITHER
# can be found the deploy fails closed. An earlier version skipped the check when
# `main` did not resolve, which is the same incident unguarded: a clone whose
# default branch is `master`, or one made with `-b <other>`, skipped the gate
# entirely and deployed a stale branch with no warning. Also compares against
# origin/main when there is no local main, so a stale local ref cannot
# legitimise a stale branch.
#
# Override for a deliberate hotfix-from-an-old-branch deploy with
# DEPLOY_ALLOW_STALE=1. There is no such override for the dirty-tree check.
base_ref=""
for candidate in main origin/main; do
  if git -C "$ROOT" rev-parse --verify --quiet "$candidate" >/dev/null; then
    base_ref="$candidate"
    break
  fi
done

if [[ "${DEPLOY_ALLOW_STALE:-0}" != "1" ]]; then
  if [[ -z "$base_ref" ]]; then
    echo "error: no 'main' or 'origin/main' ref to compare against, so the" >&2
    echo "       stale-branch check cannot run. Fetch it, or re-run with" >&2
    echo "       DEPLOY_ALLOW_STALE=1 if deploying from an old branch is genuinely" >&2
    echo "       intended. Failing closed on purpose: skipping this check is how" >&2
    echo "       the 2026-10-03 deploy shipped an app 59 commits behind." >&2
    exit 1
  fi
  if ! git -C "$ROOT" merge-base --is-ancestor "$base_ref" HEAD; then
    echo "error: HEAD is not a descendant of $base_ref — deploying this would" >&2
    echo "       replace the running app with an older build. Merge it, or" >&2
    echo "       re-run with DEPLOY_ALLOW_STALE=1 if that is genuinely intended." >&2
    git -C "$ROOT" log --oneline HEAD.."$base_ref" | sed 's/^/         missing: /' >&2
    exit 1
  fi
fi

# The host's backup record, read once. Never fatal on its own: a missing file is "unknown".
# shellcheck disable=SC2086
backup_json="$(ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" "cat '$DEPLOY_APP_DIR/data/backup-status.json'" 2>/dev/null || true)"
backup_age_h="$(python3 - "$backup_json" <<'PY'
import json, sys
from datetime import datetime, timezone
try:
    local = json.loads(sys.argv[1])["local"]
    # A failed run records its own time too; only a run that made a snapshot counts.
    if local["status"] in ("ok", "skipped (unchanged)"):
        at = datetime.strptime(local["at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        print(int((datetime.now(timezone.utc) - at).total_seconds() // 3600))
except (ValueError, KeyError, TypeError):
    pass
PY
)"
if [[ -n "$backup_age_h" ]]; then
  echo "==> last backup: ${backup_age_h}h ago"
else
  echo "==> last backup: unknown (no readable status file on the host)"
fi

# True when HEAD already holds everything the live commit shipped. Ancestry is
# the fast path. A squash-merge leaves the live SHA (a branch commit) outside
# main's history, so otherwise merge the live commit into HEAD and require that
# it adds nothing outside docs/ and the changelog, which are not code. A conflict
# is only tolerated there: a modify/delete conflict keeps the surviving file with
# no markers, so the resulting tree alone would hide it. Needs git 2.38+.
live_in_head() {
  git -C "$ROOT" merge-base --is-ancestor "$1" HEAD && return 0
  local out rc=0 merged
  out="$(git -C "$ROOT" merge-tree --write-tree --name-only HEAD "$1")" || rc=$?
  (( rc <= 1 )) || return 1
  merged="${out%%$'\n'*}"
  if (( rc == 1 )); then
    printf '%s\n' "$out" | sed -n '2,/^$/p' | grep -v '^$' | grep -qvE '^(docs/|frontend/src/lib/changelog\.json$)' && return 1
  fi
  git -C "$ROOT" diff --quiet "$merged" HEAD -- . ':!docs' ':!frontend/src/lib/changelog.json'
}

# HEAD must also contain what is running. Containing main is not enough when the
# live image came from another branch (the 2026-10-03 deploy was one).
# Fails closed: an unreachable host, a "dev" stamp or a SHA this clone does not
# have all stop the deploy. DEPLOY_ALLOW_STALE=1 is the rollback path.
if [[ "${DEPLOY_ALLOW_STALE:-0}" != "1" ]]; then
  ssh_err="$(mktemp)"
  # shellcheck disable=SC2086
  if ! live_health="$(ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" 'curl -fsS --max-time 8 http://127.0.0.1:8080/api/health' 2>"$ssh_err")"; then
    echo "error: could not query /api/health on $DEPLOY_HOST:" >&2
    sed 's/^/         /' "$ssh_err" >&2
    rm -f "$ssh_err"
    exit 1
  fi
  rm -f "$ssh_err"
  live_sha="$(printf '%s' "$live_health" | sed -n 's/.*"version":"\([0-9a-f]\{7,40\}\)".*/\1/p')"
  if [[ -z "$live_sha" ]]; then
    echo "error: /api/health on $DEPLOY_HOST has no commit SHA (got: $live_health)." >&2
    echo "       Cannot tell what is running. DEPLOY_ALLOW_STALE=1 skips this check." >&2
    exit 1
  fi
  if ! live_full="$(git -C "$ROOT" rev-parse --verify --quiet "$live_sha^{commit}")"; then
    echo "error: live version $live_sha is unknown or ambiguous in this clone. Run 'git fetch --all'." >&2
    exit 1
  fi
  if ! live_in_head "$live_full"; then
    echo "error: HEAD does not contain the live version $live_sha; deploying would drop its changes." >&2
    git -C "$ROOT" log --oneline HEAD.."$live_sha" | sed 's/^/         missing: /' >&2
    exit 1
  fi
  # A schema bump is the deploy that re-running an old image cannot undo, so it needs a
  # snapshot from the last day. Backups are manual, so nothing else takes one first.
  # DEPLOY_ALLOW_STALE=1 (rollback, hotfix) skips this whole block, guard included.
  schema_of() { git -C "$ROOT" show "$1:backend/main.py" | sed -n 's/^SCHEMA_VERSION = \([0-9]*\).*/\1/p'; }
  live_schema="$(schema_of "$live_full")"
  head_schema="$(schema_of HEAD)"
  # An unreadable version on either side counts as a change: fail closed.
  if [[ -z "$live_schema" || -z "$head_schema" || "$live_schema" != "$head_schema" ]] \
     && [[ -z "$backup_age_h" || "$backup_age_h" -gt 24 ]] \
     && [[ "${DEPLOY_ALLOW_OLD_BACKUP:-0}" != "1" ]]; then
    echo "error: this deploy changes the schema version and the last backup is not from the last 24h." >&2
    echo "       Run scripts/backup_remote.sh first, or re-run with DEPLOY_ALLOW_OLD_BACKUP=1." >&2
    exit 1
  fi
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
#
# APP_COMMIT is also written into .env here, not just exported for this one
# command: Compose auto-loads .env from the project directory for every
# invocation, so this is what lets scripts/backup.sh (or a bare `docker
# compose ...` typed by hand) resolve `${APP_COMMIT:?...}` too. Before this,
# #126 made that variable required but only ever supplied it inline to this
# one `up` call — so backup.sh's own `docker compose exec` calls failed the
# interpolation outright the moment a deploy landed the stricter compose
# file, breaking the app's only backup mechanism with no code change to
# backup.sh itself. Real incident, 2026-09-08.
#
# `.env` holds live secrets (RESEND_API_KEY, ...) and stays mode 600 — the
# rewrite runs under `umask 077` so `.env.new` is never briefly wider than
# that, and fails loudly (via `-f .env` first) rather than silently dropping
# every other line if the file is ever missing, instead of only tolerating
# grep's own "no APP_COMMIT line to remove" exit status.
# shellcheck disable=SC2086
ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" \
  "cd '$DEPLOY_APP_DIR' \
     && git pull --ff-only \
     && test -f .env \
     && (umask 077; { grep -v '^APP_COMMIT=' .env || true; printf 'APP_COMMIT=%s\n' '$short_sha'; } > .env.new) \
     && mv .env.new .env && chmod 600 .env \
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
# /api/health to {status, version} and moved it to GET /api/admin/backup-status,
# which needs an admin session this script does not have. So print the file the
# app reads, as read before the build. Never fatal here: a broken off-site leg is
# a warning, not a reason to refuse a deploy. Printed raw rather than interpreted,
# so the stale rule stays in one place (BACKUP_STALE_AFTER_S in backend/main.py).
echo "==> last backup, as recorded on the host"
if [[ -n "$backup_json" ]]; then
  printf '%s\n' "$backup_json" | sed 's/^/    /'
else
  echo "    (no status file yet; see docs/BACKUPS.md)"
fi
echo "    for the interpreted view: GET /api/admin/backup-status, as an admin"

echo "==> deploy verified: $short_sha"
