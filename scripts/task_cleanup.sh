#!/bin/bash
set -euo pipefail

# task_cleanup.sh: idempotent per-task cleanup
# Usage: task_cleanup.sh <issue-number>
#
# Removes task-created resources for the given issue number:
# - worktree at .claude/worktrees/issue-<n>
# - merged local branch (implement/issue-<n>)
# - venv and node_modules inside the worktree
#
# Idempotent: exits 0 if resources are already gone
# Refuses: unmerged branches or dirty worktrees (exits 1 and explains why)
# Derives all paths from git rev-parse --show-toplevel

if [ $# -ne 1 ]; then
  echo "Usage: task_cleanup.sh <issue-number>" >&2
  exit 1
fi

issue_num=$1
repo_root=$(git rev-parse --show-toplevel)
worktree_path="$repo_root/.claude/worktrees/issue-$issue_num"
branch_name="implement/issue-$issue_num"

# Check if worktree exists
if [ ! -d "$worktree_path" ]; then
  # Worktree already gone - check if branch needs cleanup
  if git rev-parse --verify "$branch_name" > /dev/null 2>&1; then
    # Branch exists but worktree is gone - safe to delete the branch
    git branch -d "$branch_name" 2>/dev/null || true
  fi
  exit 0
fi

# Worktree exists - check if it has uncommitted changes
if ! git worktree prune > /dev/null 2>&1; then
  true  # prune is best-effort
fi

# Check for dirty worktree
if [ -d "$worktree_path/.git" ]; then
  cd "$worktree_path"
  if [ -n "$(git status --porcelain)" ]; then
    echo "Cannot clean: worktree has uncommitted changes" >&2
    exit 1
  fi
  cd "$repo_root"
fi

# Check if branch is merged into main
if git rev-parse --verify "$branch_name" > /dev/null 2>&1; then
  if ! git merge-base --is-ancestor "$branch_name" main > /dev/null 2>&1; then
    echo "Cannot clean: branch $branch_name is not merged into main" >&2
    exit 1
  fi
fi

# Clean up: remove venv and node_modules first
if [ -d "$worktree_path/.venv" ]; then
  rm -r "$worktree_path/.venv"
  echo "Removed .venv from $worktree_path"
fi

if [ -d "$worktree_path/node_modules" ]; then
  rm -r "$worktree_path/node_modules"
  echo "Removed node_modules from $worktree_path"
fi

# Remove worktree
if [ -d "$worktree_path" ]; then
  git worktree remove "$worktree_path"
  echo "Removed worktree $worktree_path"
fi

# Remove branch (idempotent, don't fail if already gone)
if git rev-parse --verify "$branch_name" > /dev/null 2>&1; then
  git branch -d "$branch_name" 2>/dev/null || true
  echo "Removed branch $branch_name"
fi

exit 0
