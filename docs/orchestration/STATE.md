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
- **Current focus:** **#125 planned** (deploy reach + running-version visibility) — plan-only PR
  #160 merged, no app code changed yet. Plan: `docs/superpowers/plans/
  2026-09-09-125-deploy-reach-version-visibility.md` (233 lines). Key calls: version chip in
  `TopBar.jsx` (rendered on every route incl. `/login`); `vite.config.js`'s `registerType` moves
  `autoUpdate` → `prompt` (verified empirically — `autoUpdate` has no waiting state to prompt from
  at all, so the Issue's ask was structurally blocked by the current config); mid-workout
  suppression reuses the existing `shouldCheckForUpdate` gate for display, not a new flag; no new
  dependency. Full breakdown: `HISTORY.md`'s 2026-09-09-later entry.
- **Next action:** **#125 is `ready` to execute** against its new plan — next tick (or this one,
  owner's call) should run it directly, no further planning needed. Also still pickable on their
  own merits: #127, #138, #145, #157, #137, #141. **#132** stays blocked on the GUARDRAILS
  contradiction (see Needs owner, unchanged). `#152`/`#148`/other `intake` unchanged.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **#132 is stuck on a real contradiction inside GUARDRAILS.md, found this tick.** Its
  destructive-ops section lets an approved history-rewrite/force-push proceed on a fresh human
  approval — which #132 already carries (`approved` label on). But the separate Hard-stops section
  lists "a force-push... is attempted" as unconditional, "no flag overrides these." Not resolved by
  inference — the stakes (`git-filter-repo` across this repo's full history + a force-push, on a
  public repo) are too high to pick a reading unattended. Needs either a wording fix to GUARDRAILS
  (e.g. hard-stops carves out the approved-history-rewrite case explicitly) or a direct owner call
  on which section governs, before any tick attempts #132.
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
