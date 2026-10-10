#!/bin/bash
set -euo pipefail

# task_cleanup.sh: idempotent per-task cleanup
# Usage: task_cleanup.sh <issue-number>
#
# Removes what a task created, prints one line per action:
# - its venv and node_modules inside the worktree
# - the worktree at .claude/worktrees/issue-<n>
# - its local branch, once the branch is shown to be merged
#
# Exits 0 when nothing is left to do. Exits 1, before deleting anything, when the
# worktree has uncommitted changes, the branch is not shown to be merged, or the
# script runs from inside the worktree it would remove.

if [ $# -ne 1 ]; then
  echo "Usage: task_cleanup.sh <issue-number>" >&2
  exit 1
fi

issue_num=$1

# The common dir is the main checkout's .git even when run from a linked worktree,
# where --show-toplevel would name the worktree itself.
git_common=$(git rev-parse --path-format=absolute --git-common-dir)
repo_root=$(dirname "$git_common")
worktree_path="$repo_root/.claude/worktrees/issue-$issue_num"
start_dir=$(pwd -P)
cd "$repo_root"

branch_merged() {
  local branch=$1 base tip mbase
  tip=$(git rev-parse --verify "$branch")
  for base in origin/main main; do
    if git rev-parse --verify --quiet "$base" > /dev/null \
      && git merge-base --is-ancestor "$tip" "$base"; then
      return 0
    fi
  done
  # A squash merge leaves the branch tip outside main's history.
  if command -v gh > /dev/null 2>&1 \
    && gh pr list --head "$branch" --state merged --json headRefOid --jq '.[].headRefOid' 2> /dev/null \
      | grep -qx "$tip"; then
    return 0
  fi
  # Offline fallback: every file the branch changed already matches origin/main.
  if git rev-parse --verify --quiet origin/main > /dev/null; then
    mbase=$(git merge-base "$tip" origin/main) || return 1
    local f any=0
    while IFS= read -r f; do
      any=1
      git diff --quiet origin/main "$tip" -- "$f" || return 1
    done < <(git diff --name-only "$mbase" "$tip")
    [ "$any" -eq 1 ] && return 0
  fi
  return 1
}

if [ ! -e "$worktree_path" ]; then
  git worktree prune
  echo "worktree already gone: $worktree_path"
  branch_name="implement/issue-$issue_num"
else
  real_worktree=$(cd "$worktree_path" && pwd -P)
  case "$start_dir/" in
    "$real_worktree"/*)
      echo "Cannot clean: run this from the main checkout, not from inside $worktree_path" >&2
      exit 1
      ;;
  esac
  branch_name=$(git -C "$worktree_path" branch --show-current)
  if [ -n "$(git -C "$worktree_path" status --porcelain)" ]; then
    echo "Cannot clean: worktree $worktree_path has uncommitted changes" >&2
    exit 1
  fi
fi

if [ -n "$branch_name" ] && git rev-parse --verify --quiet "$branch_name" > /dev/null; then
  if ! branch_merged "$branch_name"; then
    echo "Cannot clean: branch $branch_name is not shown to be merged into main" >&2
    exit 1
  fi
  branch_known=1
else
  branch_known=0
fi

if [ -e "$worktree_path" ]; then
  for dir in backend/.venv frontend/node_modules .venv node_modules; do
    if [ -d "$worktree_path/$dir" ]; then
      rm -r "$worktree_path/$dir"
      echo "removed $dir from $worktree_path"
    fi
  done
  git worktree remove "$worktree_path"
  echo "removed worktree $worktree_path"
fi

if [ "$branch_known" -eq 1 ]; then
  git branch -D "$branch_name" > /dev/null
  echo "removed branch $branch_name"
elif [ -n "$branch_name" ]; then
  echo "branch already gone: $branch_name"
fi
