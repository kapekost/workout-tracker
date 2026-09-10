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
- **Current focus:** **#125 mid-execution, PAUSED for an owner-side laptop restart — this is a
  deliberate checkpoint, not a crash.** Tasks 1-3 of the plan (`docs/superpowers/plans/
  2026-09-09-125-deploy-reach-version-visibility.md`) are done and committed on branch
  `claude/125-deploy-reach-version-visibility` (pushed to origin — safe even if the local worktree
  is ever lost): the update-ready store in `swUpdate.js`, the `registerType: 'autoUpdate'` →
  `'prompt'` switch (independently re-verified against a real build's `dist/sw.js` — message-gated
  `skipWaiting`, zero `clientsClaim`), and `VersionBadge` mounted in `TopBar`. **A real UI bug was
  found and fixed during Task 4's screenshot/review step, on the same branch**: the shared
  `.tap-target` utility centers its invisible 44px hit-zone on the check button, which bled upward
  into the title text directly above it in this tight header layout — a real hit-test showed
  tapping the title triggered "check for update" instead. Fixed by anchoring the hit-zone's top
  edge to the button's own top (still 44px, extends only downward) instead of centering it;
  re-verified both that this fixed the overlap and that the button itself still works.
- **What's NOT done yet:** Task 4's live end-to-end verification (rebuild `dist/`, trigger a real
  SW update, confirm the reload round-trip) kept hitting a Chromium/Playwright service-worker
  lifecycle quirk in-session (`registration.update()` throwing "invalid state" after the first
  call) — looked like test-harness flakiness, not an app defect, but wasn't fully run down. Task 4's
  mid-workout-suppression screenshot pass also wasn't completed. Then: code review (`superpowers:
  requesting-code-review`), PR, CI, merge, deploy, and the real-phone verification per this repo's
  "complete means deployed" convention — none of that has happened yet either.
- **Resume from:** `claude/125-deploy-reach-version-visibility` (pushed, 4 commits ahead of
  `main`). A local worktree may still exist at
  `~/dev/workout-tracker/.claude/worktrees/agent-a8223e9aff0d079ae` with a running dev server on
  :5173 from before the restart — don't assume it's still there; the pushed branch is the durable
  copy. Next step: finish Task 4's live verification (or judge the build-artifact-level evidence
  already gathered sufficient and move straight to review), then continue the plan's own "Review,
  PR and deploy" section.
- **Also this window:** **#132**'s GUARDRAILS contradiction is fixed (2026-09-10, see
  `DECISIONS.md`) — it still needs a human to actually run the history rewrite + force-push, never
  a tick, but nothing in the docs blocks picking it up and preparing it. Other `ready` work
  untouched: #127, #138, #145, #157, #137, #141. `#152`/`#148`/other `intake` unchanged.
- **Next action:** resume #125 per the above once the owner says go.

## Stop-condition
(none — runner proceeds normally; #125's pause above is a manual checkpoint, not a stop-condition)

## In-flight
- **#125** — claimed 2026-09-10T03:54:12Z, **paused** (owner-requested checkpoint for a laptop
  restart, not abandoned — see Cursor above for exactly where to resume). Do not treat this as a
  stale/crashed claim before checking with the owner first, even past the usual 2h staleness
  window, since the owner explicitly said they'd say when to continue.

## Needs owner
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
