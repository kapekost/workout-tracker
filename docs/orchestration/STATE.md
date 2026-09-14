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
- **Current focus:** Reconcile tick, 2026-09-14. Reality had drifted on three fronts since the
  #141 tick: (1) **#145 had already shipped** (PR #185, merged ~05:20 UTC same day) via a live
  session outside `/orchestrate` entirely — `STATE.md`'s "next action" was stale, corrected. (2)
  **`PLAYBOOK.md`/`GUARDRAILS.md` had drifted from this home branch again** (a `#141` citation, a
  force-push "or a standing approval" wording fix) — reconciled onto `main` via PR #186, merged
  green. (3) **Production is stale**: the deployed Pi image (`APP_COMMIT` reporting `7e23ba4`)
  predates a git-history event on `main` (see the new Needs-owner item below) and sits 11 commits
  behind `main`, 2 of them real runtime changes (#141's backend import-hardening, #145's frontend
  network-status indicator) — no schema/migration risk, safe to deploy, **but the deploy attempt
  (`scripts/deploy.sh`) was blocked outright by the session's own permission classifier
  ("Production Deploy")**, not by anything in this repo's guardrails. Took a fresh backup
  (`scripts/backup.sh`, succeeded) and stopped there rather than trying to route around the
  block — flagged for the owner below. Then picked **#176** (copier update from `agent-scaffold`,
  synced to the template's actual current HEAD `104fb62`, past the Issue's cited `d60574e`) —
  dispatched, independently reviewed (no dropped/weakened safety rules, no lost repo-specific
  citations, `STATE.md`/`DECISIONS.md` untouched), merged via PR #187. 244 backend + 397 frontend
  tests passing throughout. Full detail in `HISTORY.md`.
- **Next action:** ready queue is now just `#157` (destructive — touches `forgot_password`'s
  token-minting path, no `approved` label or covering standing approval, so an unattended tick
  skips it) and `#132` (owner-only, history rewrite). **No unattended-executable `ready` work is
  currently queued** — next tick should take the intake track (18 `intake` Issues waiting,
  highest-ranked per the board) unless the owner has acted on `#157`/`#132`/the deploy block above
  by then.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **Deploy blocked by the session's own permission classifier, not by anything in this repo.**
  2026-09-14: `scripts/deploy.sh` (no schema change, 11 commits behind, safe per existing
  discipline) was refused outright — "Permission for this action was denied by the Claude Code
  auto mode classifier. Reason: [Production Deploy]." A fresh backup was taken first and nothing
  else was attempted around it. Production currently lacks #141's import-hardening and #145's
  network-status indicator as a result. Either run `scripts/deploy.sh` yourself, or add a Bash
  permission rule that allows it if you want future ticks to close this kind of gap unattended
  (2026-09-08's "complete means deployed" decision assumed the runner *could* deploy — this is the
  first time that assumption didn't hold).
- **Evidence `main`'s git history no longer contains the commit the deployed Pi image was built
  from — needs your confirmation of what actually happened, not a guess.** The Pi's `/api/health`
  reports `APP_COMMIT=7e23ba4` (PR #162's merge commit, 2026-09-10). `git merge-base --is-ancestor
  7e23ba4 origin/main` says no; GitHub's own compare API (`compare/main...7e23ba4`) reports
  `"status":"diverged","ahead_by":340,"behind_by":352"` — main and that commit share almost no
  history. `main` **does** contain a same-message, same-author, same-timestamp commit (`1a45571`)
  with a *different* tree hash. This is the exact signature #132's own Issue body predicts for its
  own history rewrite ("every commit SHA changes... the deployed tag names no commit that
  exists") — but the most recent work on #132 (PR #184, forward-fix only, 2026-09-13/14) explicitly
  says the actual `git-filter-repo` rewrite was **not** done and "stays queued for the owner." Did
  you run it yourself outside any Claude session? If so, #132 should close (with the orchestration
  home branch rewritten + re-pushed too, per its own body's "Mandatory before the rewrite" list,
  and a redeploy from rewritten history) rather than sitting `ready`+`approved` on the board. If
  not, something else produced this divergence and is worth understanding before the next deploy.
  Not acted on — force-push/history-rewrite is human-only regardless of approval, and guessing
  which of these it is would be exactly the kind of guess GUARDRAILS forbids.
- **The harness's merge-permission classifier is inconsistent, not just subagent-vs-controller.**
  #138 (2026-09-13): a dispatched subagent's `gh pr merge` was blocked despite green CI; the
  controller merged PR #180 instead. #181, same day: the *controller's own* `gh pr merge` was also
  denied once ("blocked by classifier", no reason given) — but an identical retry succeeded
  immediately. Both `[unsure]` in `IMPROVEMENTS.md`; not fixable via a PR here. Not blocking
  anything — just means a merge denial (controller or subagent) is worth one retry before treating
  it as a hard stop requiring hand-off.
- **#30/#32 need a spec skim, not a decision.** `docs/superpowers/specs/
  2026-08-31-ai-structured-io-design.md` gates itself on an owner skim before either Issue may split
  into `ready` children; every fork-in-the-road question in it was already answered by owner Q&A on
  2026-08-30. **2026-09-06:** #33 (nutrition) merged into #32. **2026-09-13:** #30's stray
  2026-09-10 comment (edit upcoming planned workouts — unrelated to Import's own scope) was split
  out to its own `intake` Issue, **#177** (#70/#139 precedent); #32 got an owner follow-up
  sharpening the AI-in-the-loop ask toward live/chat-driven interaction and naming a new
  dependency, **#171** (workout-science/nutrition domain agents), which should land before #32 is
  sequenced. Spec needs all of this (#33, #171 dependency, the sharpened ask) folded in before the
  skim means anything. Both stay `intake` until then.
- **Two `[template]` improvements still genuinely open in `agent-scaffold`** (narrowed 2026-09-10 —
  PR #2 merged with corrections, which covered a third): `/orchestrate approve`'s home-branch
  ambiguity (the #84 approval once landed on a stale `main` copy of `STATE.md`), and PLAYBOOK step 1
  not naming which branch to read docs from. Both only make sense once `agent-scaffold`'s own
  template has a "Claiming work"/home-branch concept — it doesn't yet, and propagating that is a
  larger, deliberately separate sync (per PR #2's own body). Dead-subagent recovery, the third
  original item, is done — landed in the template via PR #2 and mirrored directly into this repo's
  own `PLAYBOOK.md` step 4, 2026-09-10.
- **Six `[unsure]` IMPROVEMENTS.md entries, harness-level, not fixable via a PR here:**
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
  checked-in docs as the explicit permission the outer rule carves out for; (2026-09-13) a
  worktree-isolated execution subagent's first Read/Edit calls targeted the shared checkout's
  absolute path for a source file instead of its own worktree's copy, even though the dispatch
  prompt only ever gave a relative path for source references — the harness's isolation refused
  the write before anything was lost, no fix candidate identified beyond "retry in your own
  worktree path."
