# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file. **Hard budget: ~250 lines.** Every tick reads
> this file first, so its cost is per-tick and compounding — that is what keeping it bounded is for.
>
> **Home branch:** `claude/workout-tracker-backlog-bu9qnw`
> **Project number:** 3
> **Project owner:** kapekost
>
> **This file keeps no Tick log.** Each tick's write-back goes straight to `HISTORY.md` — prepended
> at the top, verbatim, per PLAYBOOK step 7 — and Cursor's "Current focus" carries the live summary
> instead. Resolved Needs-owner items move to `HISTORY.md` the same way. This file reached 1067
> lines on 2026-09-06 (~200 lines/day of tick-log growth) before the split; keeping no tick log here
> at all, rather than "the last N," is what stops it recurring.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** #138 (document the local-dev runbook) shipped 2026-09-13 — merged to `main`
  (PR #180), dispatched to the cheap model tier per the #137 policy. Verified end-to-end by the
  subagent: backend+frontend run together locally, a dev-only password snippet, and documented
  (not built) the lack of a lint script. 238 backend + 380 frontend tests green. Also resolved the
  `photo-cull` Needs-owner item this tick: it's remote-less by design (private/local), its public
  counterpart is `photo-cull-public` — see `DECISIONS.md` 2026-09-13. Full detail in `HISTORY.md`
  (2026-09-13 entries).
- **Next action:** pick the next `ready` Issue by rank (`#127, #141, #145, #157, #176` — #132 stays
  next-in-rank but is owner-only, see below).

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **A dispatched subagent's `gh pr merge` was blocked by the harness's own permission classifier**
  on #138 (2026-09-13), even though it had verified everything and CI was green — the controller
  merged PR #180 itself instead. Logged as `[unsure]` in `IMPROVEMENTS.md`; not fixable via a PR in
  this repo. Not blocking anything, just means a subagent that reaches the merge step today should
  expect to hand back to the controller rather than complete it.
- **#30/#32 need a spec skim, not a decision** — grew today. `docs/superpowers/specs/
  2026-08-31-ai-structured-io-design.md` gates itself on an owner skim before either Issue may split
  into `ready` children; every fork-in-the-road question in it was already answered by owner Q&A on
  2026-08-30. **2026-09-06:** #33 (nutrition) merged into #32 by direct owner decision, so the spec
  now needs the nutrition/in-app-AI-query scope folded in *before* the skim means anything. Until
  then #30/#32 stay `intake`.
- **Two `[template]` improvements still genuinely open in `agent-scaffold`** (narrowed 2026-09-10 —
  PR #2 merged with corrections, which covered a third): `/orchestrate approve`'s home-branch
  ambiguity (the #84 approval once landed on a stale `main` copy of `STATE.md`), and PLAYBOOK step 1
  not naming which branch to read docs from. Both only make sense once `agent-scaffold`'s own
  template has a "Claiming work"/home-branch concept — it doesn't yet, and propagating that is a
  larger, deliberately separate sync (per PR #2's own body). Dead-subagent recovery, the third
  original item, is done — landed in the template via PR #2 and mirrored directly into this repo's
  own `PLAYBOOK.md` step 4, 2026-09-10.
- **Five `[unsure]` IMPROVEMENTS.md entries, harness-level, not fixable via a PR here:**
  (2026-08-30) the `code-review` skill's forked execution silently reviewed the wrong attached repo
  with no explicit target given; (2026-08-31) the Agent tool without `isolation:'worktree'` shared
  the parent session's own checkout, and its `git checkout -b` silently switched the orchestrator's
  own branch mid-session; (2026-09-07) a rejected Agent tool call had actually already run to full
  completion in its own worktree, undetected until a re-dispatch stumbled on the duplicate — real
  fix candidate: a rejected dispatch should guarantee the subagent never started, or the harness
  should surface that it started anyway, so "rejected" and "ran to completion" are never both true;
  (2026-09-09) this session's injected CLAUDE.md/AGENTS.md project instructions were for a
  different attached repo (kapekost-web) than the one `/orchestrate` actually targeted, caught only
  by hand-matching the command banner text against each repo's own command file, not by anything in
  this file; (2026-09-09) the outer session's generic single-branch dispatch assignment conflicted
  with this repo's own multi-branch orchestration design, resolved by treating this repo's own
  checked-in docs as the explicit permission the outer rule carves out for.
