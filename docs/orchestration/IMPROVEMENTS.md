# Improvements Log

<!-- last-reviewed-count: 2 -->

Append one line per entry via `scripts/append_improvement.sh <local|template|unsure> "<note>"` — do
not edit this file by hand except to resolve a conflict. Reviewed automatically at the end of any
`/orchestrate` tick that added a new entry (see `PLAYBOOK.md` step 8); entries before the
`last-reviewed-count` marker above are never re-scanned.

## Log
- [unsure] 2026-08-30: code-review skill (Skill tool, forked execution) silently reviewed a completely different attached repo (kapekost-web, not workout-tracker) when invoked with no explicit target in this multi-repo session — had to re-invoke with an explicit '<path> diff <base>...<head>' arg to get a correct result. Not a workout-tracker doc/config fix; likely a Claude Code harness/skill-runtime behavior (cwd/context not scoped per-repo for forked skill execution).
- [local] 2026-08-30: Feature intake's ready-vs-split binary (PLAYBOOK.md step 3 / Feature intake section) has no path for 'owner Q&A shaped it, but it still needs a written spec before ready' — hit repeatedly this session (#27, #30, #32, #33 all landed here, unlike #29 whose answers were concrete enough to split directly into child issues). Worked around it ad hoc each time (comment + DECISIONS.md entry, stays intake, note 'needs a spec pass'). Fixed via PR #71 — PLAYBOOK.md now names this as a third Feature Intake outcome.
