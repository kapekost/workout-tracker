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
- **Current focus:** **#131 shipped** (UI Wave 3 — consistency debt), closing out the three-wave
  UI review (#129/#130/#131 all now merged). Unblocked `blocked`→`ready` the same way #129/#130
  were. Eight items: dead Tailwind class removed from the cues modal, `NavBar` constrained to the
  content column, `TopBar`'s duplicate page label dropped on nav routes, two new type tokens + a
  12-site sweep, `StatPair` onto `Eyebrow`/tokens, three small `Chip`/`Workout` fixes (dead prop,
  day-colored checkmark, subtitle styling), `PersonalBests`' add-form behind a disclosure, `.card`'s
  8 padding variants consolidated to 3 tokens across ~10 files. PR #153, merged `5b35943`.
  **First dispatch of this issue died mid-task from an infra error** (API connection closed) before
  it had created a worktree or made any commits — per this repo's own documented dead-subagent
  lesson, checked for salvageable work first (none existed, confirmed via `git worktree list`), then
  re-dispatched clean with an added instruction to commit/push incrementally rather than only at the
  end, so a repeat failure loses at most one item's worth of work next time. Independent code review
  found no Critical/Important issues (2 trivial Minor nits fixed before merge). Independent UI/UX
  review caught a process slip, not a code bug: the screenshot meant to show the `PersonalBests`
  disclosure open actually showed it closed (a capture-timing mistake) — re-verified live
  immediately after, confirmed working correctly. Hand-verified all eight items live against a real
  backend. 362/362 unit, 22/22 e2e, clean build. **Merged, not yet deployed** — #129/#130 are live
  on the Pi (deployed the prior tick), #131 is sitting on top of that same `main` waiting for the
  next deploy whenever the owner wants it.
- **Next action:** No UI wave work left — the three-wave review is fully shipped. **#152**
  (`intake`) is the natural next design-related item: owner asked for a UI icon/polish pass,
  flagging Home's "Next up" 🔥 icon as an irrelevant example; not yet triaged, needs a scoping pass
  (custom SVGs vs. an icon library, targeted fix vs. broader design pass) before `ready`.
  Unsequenced and pickable on their own merits: #125, #127, #138, #145, #135 (`ready`), #141 (P3),
  #148 (`intake`). Queued behind accounts by owner call: **#132** (history scrub, `approved` label
  on, mirror backup mandatory), **#137** (model tiering).

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
- **Three `[unsure]` IMPROVEMENTS.md entries, harness-level, not fixable via a PR here:**
  (2026-08-30) the `code-review` skill's forked execution silently reviewed the wrong attached repo
  with no explicit target given; (2026-08-31) the Agent tool without `isolation:'worktree'` shared
  the parent session's own checkout, and its `git checkout -b` silently switched the orchestrator's
  own branch mid-session; (2026-09-07) a rejected Agent tool call had actually already run to full
  completion in its own worktree, undetected until a re-dispatch stumbled on the duplicate — real
  fix candidate: a rejected dispatch should guarantee the subagent never started, or the harness
  should surface that it started anyway, so "rejected" and "ran to completion" are never both true.
