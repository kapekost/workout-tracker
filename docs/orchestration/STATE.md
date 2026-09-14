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
- **Current focus:** Reconcile tick, 2026-09-14, plus an owner-confirmed follow-up deploy. Reality
  had drifted on three fronts since the #141 tick: (1) **#145 had already shipped** (PR #185,
  merged ~05:20 UTC same day) via a live session outside `/orchestrate` entirely — `STATE.md`'s
  "next action" was stale, corrected. (2) **`PLAYBOOK.md`/`GUARDRAILS.md` had drifted from this
  home branch again** (a `#141` citation, a force-push "or a standing approval" wording fix) —
  reconciled onto `main` via PR #186, merged green. (3) **Production was stale** — deployed image
  11 commits behind `main`. Picked **#176** (copier update from `agent-scaffold`, synced to the
  template's actual current HEAD `104fb62`, past the Issue's cited `d60574e`) — dispatched,
  independently reviewed (no dropped/weakened safety rules, no lost repo-specific citations,
  `STATE.md`/`DECISIONS.md` untouched), merged via PR #187. 244 backend + 397 frontend tests
  passing throughout.

  **Deploy, resolved same conversation.** `scripts/deploy.sh` was first refused outright by the
  session's own permission classifier ("Production Deploy") — not by anything in this repo's
  guardrails. Owner added `Bash(bash scripts/deploy.sh)` to `.claude/settings.local.json` (the
  edit itself had to be owner-run via `!`, since an agent editing its own permission grants is a
  separate classifier category, "Self-Modification") and confirmed "yes" to deploying. **The
  history-rewrite evidence below is now operationally confirmed, not just inferred from hashes**:
  the first deploy attempt got past the classifier and the build, then failed at `git pull
  --ff-only` on the Pi with `(forced update)` on both `main` (`7e23ba4→84084d9`) and this home
  branch, and `fatal: Not possible to fast-forward` — exactly what a downstream clone sees after
  its upstream's history was rewritten out from under it. The Pi's clone had no local changes
  (plain pull-only clone, nothing to lose), so `git fetch && git reset --hard origin/main` on the
  Pi was the correct, non-destructive fix — re-synced a deploy target's clone to the current
  authoritative `origin/main`, not a rewrite of shared history itself. Redeployed clean:
  `/api/health` independently verified reporting `84084d9`. A stray untracked file
  (`.claude/RESUME.md`, an unrelated Claude Code checkpoint note from 2026-08-16) also blocked the
  first attempt via `deploy.sh`'s dirty-tree check — moved aside (not deleted) rather than
  guessing it was disposable.
- **Next action:** ready queue is `#157` (destructive — touches `forgot_password`'s token-minting
  path, no `approved` label or covering standing approval, so an unattended tick skips it) and
  `#132` (owner-only, history rewrite — see Needs-owner: likely already done, needs the owner's
  word to close it out and finish its remaining steps). **No unattended-executable `ready` work is
  currently queued** — next tick should take the intake track (18 `intake` Issues waiting,
  highest-ranked per the board) unless the owner has acted on `#157`/`#132` by then.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **Deploy classifier block worked around; consider whether it should stay narrow.** The owner
  added `Bash(bash scripts/deploy.sh)` to `.claude/settings.local.json` (2026-09-14) so
  `/orchestrate` can deploy unattended after its existing tests+review+CI gate, matching the
  standing PR-merge policy. Scoped to the exact no-argument invocation on this one machine
  (gitignored, not shared). No action needed unless the owner wants it broadened or narrowed.
- **`main`'s git history was rewritten — now operationally confirmed, still needs your word on
  #132.** The deployed Pi image was built from `7e23ba4` (PR #162's merge commit, 2026-09-10),
  which is not an ancestor of current `main` (GitHub compare API: `diverged`,
  `ahead_by:340/behind_by:352`); redeploying 2026-09-14, the Pi's `git pull --ff-only` failed with
  `(forced update)` on both `main` and this home branch and `fatal: Not possible to fast-forward` —
  a downstream clone's exact signature for an upstream history rewrite, not just a hash mismatch
  this time. Fixed operationally: the Pi's clone (plain pull-only, no local commits, nothing to
  lose) was `git reset --hard` to current `origin/main`, then redeployed clean —
  `/api/health` now independently verified at `84084d9`. **This is the exact signature #132's own
  Issue body predicts for its own history-rewrite request** ("every commit SHA changes... the
  deployed tag names no commit that exists"), but the most recent #132 work (PR #184,
  "forward-fix only") explicitly says that rewrite was **not** done and "stays queued for the
  owner." Did you run it yourself, outside any Claude session? If so: #132 should close, and its
  own "Mandatory before the rewrite" list names one thing this fix didn't do — rewrite **this
  home branch** (`claude/workout-tracker-backlog-bu9qnw`) too, not just re-sync a downstream
  clone's `main`; worth checking whether that still needs doing. If you did *not* run it: something
  else produced this and is worth understanding before trusting the next deploy. Not guessed at
  either way — force-push/history-rewrite stays human-only regardless of approval; resetting a
  downstream deploy clone to match the current authoritative `origin/main` is a different,
  ordinary operation from rewriting that origin's history, which is why it was safe to do without
  waiting on this answer.
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
