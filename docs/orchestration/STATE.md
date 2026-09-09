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
  backend. 362/362 unit, 22/22 e2e, clean build.
  **Deployed same session** (owner: "let's make sure to consider something complet[e] that is
  al[s]o deployed" — new standing bar, recorded in `DECISIONS.md`): #131 went from merged-only to
  live on the Pi (`5b35943`). Taking the pre-deploy backup responsibly (per that same new bar)
  surfaced a real bug: `docker compose exec` (what `scripts/backup.sh` uses) failed outright with
  `required variable APP_COMMIT is missing a value` — #126 made that variable required in
  `docker-compose.yml` but only ever supplied it inline to `deploy.sh`'s own `up` call, so every
  deploy since #126 landed had been silently breaking the app's only backup mechanism. Filed as
  **#154**, fixed in **PR #155** (writes `APP_COMMIT` into the target's `.env` so Compose's
  auto-load covers `backup.sh` too; independent code review caught two real permission/robustness
  gaps — a transient wider-than-600 window on the secrets file, and an over-broad `|| true` that
  would've silently dropped other `.env` lines on a genuine read failure — both fixed before merge).
  Deployed for real (`87f5c53`) and independently re-verified: `.env` now carries `APP_COMMIT`,
  `bash scripts/backup.sh` succeeds standalone with no manual export. Mirrored the new
  `DECISIONS.md` entry to `main` via **PR #156** (stable-doc sync, same pattern as PLAYBOOK/
  GUARDRAILS) — also added a short note on `main`'s copy pointing back to the home branch, since
  two prior ticks got burned reading `main`'s stale `DECISIONS.md`.
- **Next action:** No UI wave work left — the three-wave review is fully shipped and deployed.
  **#152** (`intake`) is the natural next design-related item: owner asked for a UI icon/polish
  pass, flagging Home's "Next up" 🔥 icon as an irrelevant example; not yet triaged, needs a scoping
  pass (custom SVGs vs. an icon library, targeted fix vs. broader design pass) before `ready`.
  Unsequenced and pickable on their own merits: #125, #127, #138, #145, #135 (`ready`), #141 (P3),
  #148 (`intake`). Queued behind accounts by owner call: **#132** (history scrub, `approved` label
  on, mirror backup mandatory), **#137** (model tiering). **New from this tick's own finding:**
  worth a spot-check that no other operational script/doc assumes `APP_COMMIT` is available without
  either `deploy.sh`'s inline export or the new persisted `.env` value — none found this pass, but
  not exhaustively audited beyond `backup.sh` and the off-LAN recipe.

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#135** — claimed 2026-09-09T00:02:55Z, scheduled routine.

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
