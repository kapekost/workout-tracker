# Improvements Log

<!-- last-reviewed-count: 1 -->

Append one line per entry via `scripts/append_improvement.sh <local|template|unsure> "<note>"` — do
not edit this file by hand except to resolve a conflict. Reviewed automatically at the end of any
`/orchestrate` tick that added a new entry (see `PLAYBOOK.md` step 8); entries before the
`last-reviewed-count` marker above are never re-scanned.

## Log
- [unsure] 2026-08-30: code-review skill (Skill tool, forked execution) silently reviewed a completely different attached repo (kapekost-web, not workout-tracker) when invoked with no explicit target in this multi-repo session — had to re-invoke with an explicit '<path> diff <base>...<head>' arg to get a correct result. Not a workout-tracker doc/config fix; likely a Claude Code harness/skill-runtime behavior (cwd/context not scoped per-repo for forked skill execution).
- [template] 2026-09-02: Children created during an intake split can land with no state label at all, making them invisible to both tracks. PLAYBOOK's Feature-intake step 3 requires children be 'type/priority/effort labeled' and never names a state label; the ISSUE_TEMPLATE forms default to 'intake' but only for UI-created Issues, and 'gh issue create' during a split bypasses the form entirely. Real case: #68 (workout-tracker) was created 2026-08-30 alongside #66/#67/#69, got type/priority/effort but no ready/intake, and was skipped by both 'gh issue list --label ready' and intake triage for 3 days. Fix: (a) step 3 must require a state label on every child, (b) step 2's reconcile must query for open Issues carrying no state label.
