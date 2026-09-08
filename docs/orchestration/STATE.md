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
- **Current focus:** **#130 shipped** (UI Wave 2 — the screens around the logger), same tick as
  #129. Unblocked `blocked`→`ready` the same way #129 was. Six items: Progress auto-selects the
  first exercise + real 44px chip targets, `DisclosureRow` → real `<button aria-expanded>` +
  global `:active`/`:focus-visible` states, Finish Workout moved into the header slot, first-run
  Home hides the empty recovery picker/export link, contrast fix (measured: `muted2` ~4.08:1 →
  ~5.29:1, recovery-disclosure text 2.61:1 → clears AA), copy pass on 5 developer-facing strings.
  PR #151, merged `98c89a0`. **Real finding, not a rejected duplicate:** the tool call that
  dispatched #130's implementation was interrupted mid-turn and reported as user-rejected, but had
  actually already run to completion in its own worktree — the re-dispatch (per the user's explicit
  "re-dispatch as before") found a second, equivalent, never-pushed 6-commit implementation sitting
  there. Inspected for anything unique, found none, discarded before it ever reached a push — no
  collision, no lost work. Logged as an `[unsure]` IMPROVEMENTS.md entry (harness rejection/execution
  semantics, not fixable here). Independent code review found one Important issue (Home's "Last
  session" card missed the `DisclosureRow`-style button fix, outside item 8's stated file scope) —
  fixed same tick. Independent UI/UX review of the rendered screens caught a real regression in
  that very fixup (chrome-reset styles landed on the same element as `.card`, cancelling its own
  background/border — the card lost its visible box entirely) — fixed in a second follow-up commit,
  re-verified live in a browser (card box restored, focus ring visible on tab). Hand-verified all
  six items live against a real backend. 347/347 unit, 20/20 e2e, clean build.
  **Deployed same session, owner request ("deploy too"):** the Pi jumped straight from `2bd2885`
  (the #86 build) to `98c89a0` in one deploy — the whole #87/#142/#126/#124/#129/#130 batch had been
  sitting merged-not-deployed. Checked first: no schema/migration changes anywhere in that range
  (`git diff 2bd2885..98c89a0 -- backend/main.py` touches only endpoint role-gating and an
  auto-snapshot-on-import path, no `CREATE`/`ALTER TABLE`, no `user_version` bump), so this was a
  routine deploy, not a migration one. Took a fresh manual backup on the Pi first anyway (backups
  are manual-only since 2026-09-04, and this was a large batch after a long gap) —
  `scripts/backup.sh` exit 0, local+remote both `ok`. `scripts/deploy.sh` ran clean (build → arm64
  image → transfer → restart), then independently re-verified rather than trusting its own
  assertion: `curl /api/health` → `{"status":"ok","version":"98c89a0"}`, `docker ps` shows the
  container running the exact commit tag (not `:latest`), Home Assistant co-tenant unaffected
  (`Up 47 hours (healthy)`, untouched by this deploy).
- **Next action:** UI Wave 3 **#131** is next in the owner's 2026-09-06 order, but **explicitly
  handed off, owner's call this tick** ("handoff for phase 3") — do not pick it up automatically;
  wait for the next `/orchestrate` invocation or explicit instruction. Its blocker (UI Wave 2) is
  now shipped, so the same `blocked`→`ready` reconciliation #129 and #130 each needed will apply
  when it's picked up. New this tick: **#152** (`intake`, new) — owner asked for a UI icon/polish
  pass, flagging Home's "Next up" 🔥 icon as an irrelevant example; not yet triaged, needs a scoping
  pass (custom SVGs vs. an icon library, targeted fix vs. broader design pass) before `ready`.
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
