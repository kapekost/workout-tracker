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
- **Current focus:** **#124 shipped** (logout now wipes device-held data — the per-session
  `restTimerStorage` sweep, the current-commit `api-reads` cache, both unconditional even when the
  logout request itself fails offline; `restPrefSec` deliberately kept, documented as a device
  setting not account data). Owner approved it directly via `/orchestrate approve 124` (not a
  standing approval — an individual grant for this issue). PR #147, merged as `b24337b`; #148 filed
  from a non-blocking code-review observation (offline logout can't invalidate the server session,
  `intake`, needs a fix approach decided). **CI regression, found and fixed same tick, not a flake:**
  the first push failed all 16 e2e tests identically (a new `apiCacheName.js` import served at
  `/apiCacheName.js` in dev, which the bare `/api` proxy-key prefix-matched and forwarded to a
  backend that doesn't run in that job) — an independent code review had already returned "ready to
  merge" and missed it, since review never executes the code. Root-caused by reproducing the
  failing test locally; fixed by scoping the proxy key to `/api/`. `IMPROVEMENTS.md` entry logged;
  `PLAYBOOK.md` step 6 updated on the home branch with the lesson (mirrored to `main` — see below).
  Accounts workstream (5/5), #142, #126 all still shipped as of the prior tick — see `HISTORY.md`.
  Merged-not-deployed: the Pi still runs `2bd2885` (the #86 build) — predates #87, #142, #126, #124.
- **Next action:** UI waves **#129/#130/#131**, in the owner's 2026-09-06 order — next now that
  #124 has landed (#142 and #126 were both worked out of turn by direct owner call, not a reshuffle,
  so the original order resumes here). Unsequenced and pickable on their own merits: #125, #127,
  #138, #145, #135 (`ready`), #141 (P3), **#148** (new, `intake`). Queued behind accounts by owner
  call: **#132** (history scrub, `approved` label on, mirror backup mandatory), **#137** (model
  tiering).

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#129** — claimed 2026-09-07T18:54:30Z, live session.

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
