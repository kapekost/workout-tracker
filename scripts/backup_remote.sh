#!/usr/bin/env bash
# Run scripts/backup.sh on the deploy target. Reads the host from AGENTS.local.md the
# same way deploy.sh does, so an agent can run this without reading that file.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
eval "$(sed -n '/^## Scripted deploy configuration$/,/^## /p' "$ROOT/AGENTS.local.md" \
  | sed -n '/^DEPLOY_HOST=/p; /^DEPLOY_APP_DIR=/p; /^DEPLOY_SSH_OPTS=/p')"
: "${DEPLOY_HOST:?AGENTS.local.md must define DEPLOY_HOST under '## Scripted deploy configuration'}"
: "${DEPLOY_APP_DIR:?AGENTS.local.md must define DEPLOY_APP_DIR under '## Scripted deploy configuration'}"

# shellcheck disable=SC2086 # DEPLOY_SSH_OPTS is a list of options
ssh ${DEPLOY_SSH_OPTS:-} "$DEPLOY_HOST" "cd '$DEPLOY_APP_DIR' && bash scripts/backup.sh"
