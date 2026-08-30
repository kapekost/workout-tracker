# Improvements Log

<!-- last-reviewed-count: 1 -->

Append one line per entry via `scripts/append_improvement.sh <local|template|unsure> "<note>"` — do
not edit this file by hand except to resolve a conflict. Reviewed automatically at the end of any
`/orchestrate` tick that added a new entry (see `PLAYBOOK.md` step 8); entries before the
`last-reviewed-count` marker above are never re-scanned.

## Log
- [unsure] 2026-08-30: code-review skill (Skill tool, forked execution) silently reviewed a completely different attached repo (kapekost-web, not workout-tracker) when invoked with no explicit target in this multi-repo session — had to re-invoke with an explicit '<path> diff <base>...<head>' arg to get a correct result. Not a workout-tracker doc/config fix; likely a Claude Code harness/skill-runtime behavior (cwd/context not scoped per-repo for forked skill execution).
