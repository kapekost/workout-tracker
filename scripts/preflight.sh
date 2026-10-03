#!/usr/bin/env bash
# Preflight: establish the state of the world before touching anything.
#
# Written 2026-10-03 after a review-and-deploy session in which an agent
# branched from a diverged side branch, produced four false Critical security
# findings against code that was already fixed, and deployed a build 59 commits
# behind main that silently removed three UI components. Every one of those was a
# failure of premise, not of code.
#
# The lesson from that session, and from
# https://kapekost.co.uk/blog/an-ai-agent-i-didnt-have-to-trust: "I would rather
# have a test that makes the bad outcome impossible than an agent that is merely
# well-behaved." A paragraph in AGENTS.md is advice. This is a check.
#
# Read-only. Touches nothing, changes nothing. Run it first, every session.
#
#   bash scripts/preflight.sh
#
# Exit 0 = safe to proceed. Exit 1 = a BLOCKER was found; read the output.

set -uo pipefail

# Fail closed if there is no repo. `cd "$(git rev-parse --show-toplevel || pwd)"`
# is the bug this replaces: `cd ""` is a no-op in bash, so outside a repo the
# script went on to report "clean tree, no linked worktrees" and exited 0 — a
# confident all-clear about a directory it knew nothing about, which is the
# precise failure mode this script exists to eliminate.
if ! top="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "BLOCKER  not inside a git repository — cannot establish state." >&2
  echo "         Run this from a clone, or cd to one first. Refusing to report" >&2
  echo "         a clean state it has not checked." >&2
  exit 1
fi
cd "$top"

BLOCK=0
warn() { printf '  %s\n' "$*"; }
bad()  { printf '  BLOCKER  %s\n' "$*"; BLOCK=1; }

echo "== 1. What is deployed, and is it what I am about to build on? =="
# Asking "which branch am I on" answers the wrong question. The question is
# what the running app IS, and whether that is the thing you think it is.
DEPLOY_TARGET="${DEPLOY_TARGET:-}"
if [[ -z "$DEPLOY_TARGET" ]]; then
  # Deliberately no host default: AGENTS.local.md is gitignored, and this script
  # must stay runnable from a plain clone with no local config.
  if [[ -f AGENTS.local.md ]]; then
    warn "set DEPLOY_TARGET=<host:port> to check the live box against local HEAD"
  else
    warn "no AGENTS.local.md and no DEPLOY_TARGET — skipping the live comparison"
  fi
  warn "  run: curl -s http://\$DEPLOY_TARGET/api/health"
else
  health="$(curl -fsS --max-time 8 "http://$DEPLOY_TARGET/api/health" 2>/dev/null)"
  if [[ -z "$health" ]]; then
    warn "could not reach $DEPLOY_TARGET — is it up, and is the URL right?"
  else
    running="$(printf '%s' "$health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
    head_sha="$(git rev-parse --short HEAD)"
    warn "running version : ${running:-unknown}"
    warn "local HEAD      : $head_sha"
    if [[ -n "$running" && "$running" == "$head_sha" ]]; then
      warn "match           : yes — local HEAD is what is live"
    else
      warn "match           : NO — they differ."
      warn "  Anything you deploy will CHANGE the running app. If you expected"
      warn "  to be shipping a no-op, stop and find out why first."
    fi
    if [[ "$running" =~ ^[0-9a-f]{7,40}$ ]] && git cat-file -e "$running^{commit}" 2>/dev/null \
       && ! git merge-base --is-ancestor "$running" HEAD; then
      bad "HEAD does not contain the live version $running; deploying would drop its changes."
    fi
    if [[ "$running" == "dev" || -z "$running" ]]; then
      warn "  note: 'dev' means the image was built without --build-arg APP_COMMIT,"
      warn "  so the stamp proves nothing. Rebuild with APP_COMMIT set."
    fi
  fi
fi

echo
echo "== 2. Is the branch state coherent? (all branches, not just this one) =="
# "Which branch am I on" is a single-branch question and it is the wrong one. The
# useful question is whether the branch graph has diverged anywhere, because the
# branch you are standing on may be fine while the one you branch from next is
# not — or while the deploy target's own clone is behind.
if git rev-parse --verify --quiet main >/dev/null; then
  if git merge-base --is-ancestor main HEAD; then
    warn "main is an ancestor of HEAD — this branch contains main"
  else
    bad "main is NOT an ancestor of HEAD — this branch has diverged or is behind."
    warn "  behind main by: $(git rev-list --count HEAD..main) commits"
    warn "  ahead of  main: $(git rev-list --count main..HEAD) commits"
    git log --oneline HEAD..main | head -20 | sed 's/^/    missing: /'
    warn "  Do not branch, review or deploy from here. Reconcile first."
  fi
  # Every local branch that is behind main is a future trap. Report them; this
  # is a warning, not a blocker, because an old branch is sometimes deliberate.
  behind="$(git for-each-ref --format='%(refname:short)' refs/heads \
            | while read -r b; do
                if ! git merge-base --is-ancestor main "$b" 2>/dev/null; then echo "$b"; fi
              done)"
  if [[ -n "$behind" ]]; then
    warn
    warn "local branches NOT containing main (traps for whoever branches next):"
    printf '%s\n' "$behind" | sed 's/^/    /'
  fi
else
  warn "no local main ref — run: git fetch origin main:main"
fi

echo
echo "== 3. Is someone else's work in progress here? =="
# The question is not "what is my HEAD" but "has anyone left something half
# done in this working tree". A shared directory means the answer can change
# under you, so it is checked rather than assumed.
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  warn "uncommitted changes present:"
  git status --porcelain | head -20 | sed 's/^/    /'
  warn "  If you did not make these, another agent is mid-task. Coordinate before"
  warn "  editing the same files, and do NOT stash or discard them."
elif [[ -n "$(git worktree list 2>/dev/null | tail -n +2)" ]]; then
  warn "linked worktrees exist (another agent may be working in one):"
  git worktree list | tail -n +2 | sed 's/^/    /'
else
  warn "clean tree, no linked worktrees"
fi
# Stashes are the quietest way to lose another agent's work.
if git rev-parse --verify --quiet refs/stash >/dev/null; then
  warn "stashes present (each may be another agent's parked work):"
  git stash list | head -10 | sed 's/^/    /'
fi

echo
echo "== 4. Is the tree deployable as-is? =="
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  warn "dirty — scripts/deploy.sh will refuse to build. Commit or shelve first."
else
  warn "clean — deploy.sh's dirty-tree gate would pass"
fi

echo
if [[ "$BLOCK" == "1" ]]; then
  echo "RESULT: BLOCKED. Fix the blocker above before branching, reviewing or deploying."
  echo "        If a branch really must deploy from behind main, that is"
  echo "        DEPLOY_ALLOW_STALE=1 in deploy.sh — a deliberate, recorded choice,"
  echo "        not a workaround."
  exit 1
fi
echo "RESULT: no blockers. Record what you found above before you start —"
echo "        the next agent will not know it, and 'git log' will not tell them."
exit 0