# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file. **Hard budget: ~250 lines.** Every tick reads
> this file first, so its cost is per-tick and compounding — that is what keeping it bounded is for.
>
> **This file keeps no Tick log.** Each tick's write-back goes straight to `HISTORY.md` — prepended
> at the top, verbatim, per PLAYBOOK step 7 — and Cursor's "Current focus" carries the live summary
> instead. Resolved Needs-owner items move to `HISTORY.md` the same way. This file reached 1067
> lines on 2026-09-06 (~200 lines/day of tick-log growth) before the split; keeping no tick log here
> at all, rather than "the last N," is what stops it recurring.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** **#129 shipped** (UI Wave 1 — the in-gym logging path). Unblocked from
  `blocked`→`ready` this tick since its blocker (the accounts workstream, done as of #124) had
  resolved but the label hadn't caught up. Six items: fetch timeout + honest retry copy (typed
  weight/reps survive a failure), logged sets moved below the logger so the Log Set button holds a
  fixed position, `scrollMarginTop` on auto-advance so the next exercise isn't hidden behind the
  header, tap-again-to-confirm on set delete (reused `History.jsx`/`PersonalBests.jsx`'s existing
  pattern), the overload suggestion promoted above last-workout history, 44px steppers + real
  aria-labels. PR #150, merged `b29fa35`. Independent code review found no Critical/Important
  issues (3 trivial Minor nits — aria-label casing, an e2e coverage gap on the 44px input, a
  tautological jsdom assertion — fixed in a follow-up commit, re-verified green). Independent
  UI/UX review of the rendered screens (real backend + dev server, logged-in session, real sets
  logged, screenshots) returned **ready to merge**, no blocking findings; two non-blocking
  follow-ups noted for whoever next touches this component: the armed delete icon (`✓?`) renders
  smaller than the resting `×`, and the suggestion line's wrap behavior at heavier weights (e.g.
  "102.5kg") wasn't checked on a true narrow viewport. Hand-verified live: button position holds
  across sets 1-3, suggestion renders promoted, delete requires two taps and auto-re-arms after the
  window elapses, auto-advance isn't clipped. 326/326 unit, 16/16 e2e, clean build.
  Merged-not-deployed: the Pi still runs `2bd2885` (the #86 build) — predates #87, #142, #126,
  #124, and now #129 too.
- **Next action:** UI Wave 2 **#130**, next in the owner's 2026-09-06 order — its blocker (UI Wave
  1) is now shipped, but the `blocked` label itself hasn't been flipped yet (same situation #129
  was in at the top of this tick); do that reconciliation at the start of the next tick before
  picking it up. #131 (UI Wave 3) follows after. Unsequenced and pickable on their own merits:
  #125, #127, #138, #145, #135 (`ready`), #141 (P3), #148 (`intake`). Queued behind accounts by
  owner call: **#132** (history scrub, `approved` label on, mirror backup mandatory), **#137**
  (model tiering).

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **#30/#32 need a spec skim, not a decision** — grew today. `docs/superpowers/specs/
  2026-08-31-ai-structured-io-design.md` gates itself on an owner skim before either Issue may split
  into `ready` children; every fork-in-the-road question in it was already answered by owner Q&A on
  2026-08-30. **2026-09-06:** #33 (nutrition) merged into #32 by direct owner decision, so the spec
  now needs the nutrition/in-app-AI-query scope folded in *before* the skim means anything. Until
  then #30/#32 stay `intake`.
- **Three `[template]` improvements are queued against `agent-scaffold` PR #2** (open, unreviewed,
  no CI on that repo — all four `tests/*.sh` run locally and pass): (1) dead-subagent recovery —
  PLAYBOOK should require inspecting a dead agent's worktree for uncommitted work before
  re-dispatching; (2) `/orchestrate approve`'s home-branch ambiguity (the #84 approval once landed
  on a stale `main` copy of `STATE.md`); (3) PLAYBOOK step 1 not naming which branch to read docs
  from (fixed locally here in PR #116; `agent-scaffold` has the same gap). Filing any of them needs
  a named credential or a direct owner ask per GUARDRAILS "Cross-repo writes" — `~/dev/agent-scaffold`
  is checked out locally if the owner would rather apply them by hand.
- **Two `[unsure]` IMPROVEMENTS.md entries, harness-level, not fixable via a PR here:**
  (2026-08-30) the `code-review` skill's forked execution silently reviewed the wrong attached repo
  with no explicit target given; (2026-08-31) the Agent tool without `isolation:'worktree'` shared
  the parent session's own checkout, and its `git checkout -b` silently switched the orchestrator's
  own branch mid-session — real fix candidate for PLAYBOOK's Execute step: default to
  `isolation:'worktree'` for any subagent dispatch doing its own git branch/commit work.
