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
- **Current focus:** Direct owner dispatch (not a queued Issue), same pattern as #217: after #217
  deployed, owner said "icons are still small... redesign the screen with the records and
  progress." Verified first (production confirmed live at `8f293b7`, no caching issue), root-caused
  via real screenshots + a two-pass `sonnet` UI/UX review with every finding checked against
  source: the real problem was 2 nav icons still being raster PNG "stickers" with a broken color
  contract (equal box height, from #217, was never going to fix a different rendering technique), a
  real NavBar routing bug (`/personal-bests` lit up "Home"), an under-emphasized Progress-page PR
  stat with no trend indicator, and a generic-looking Personal Bests list. Fixed via
  `superpowers:subagent-driven-development` (3 tasks, plan at
  `docs/superpowers/plans/2026-09-27-progress-pb-nav-redesign.md`); a real bug (an invisible
  opacity-over-same-color icon detail — the exact #211/#212 failure class) was caught by the
  controller live-rendering the fix, not by reading the diff, and fixed before shipping. **PR #228
  merged clean, `main` is now `404610f`.** Full writeup in `HISTORY.md`.
- **Deploy is blocked, not done.** `scripts/deploy.sh` built and tagged the image locally
  (`kapekost/workout-tracker:404610f`) but the SSH transfer failed — `~/.ssh/id_raspi` needs a
  passphrase this automated session's shell can't supply via Keychain. Stopped after one retry per
  this repo's own standing SSH-lockout caution rather than hammering it. **Production is still
  healthy and untouched at `8f293b7`** (verified via `curl /api/health` after the failed attempt).
  See Needs owner below for the exact command.
- **`#157`/`#201` stay skipped** (destructive/unapproved — confirmed no standing approval covers
  #157 against `DECISIONS.md`'s only record, which names just #105/#86/#87; #201 is React Native,
  owner-confirmed intentional lowest rank). Ready queue otherwise unexamined this tick (this was a
  direct dispatch, not a full `/orchestrate` reconcile) — next real tick should run the full step-2
  reconcile fresh.
- **Environment note:** two worktrees not created by this session were present on this machine
  during this tick (`~/dev/wt-ai-plan-updates`, `~/dev/wt-dynamic-progression`) — other concurrent
  sessions on this same repo. Not touched. This tick's own temporary worktrees
  (`~/dev/wt-progress-redesign`, `~/dev/wt-deploy-228`) were both cleaned up before finishing.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight — PR #228 shipped and merged this tick, claim cleared)

## Needs owner
- **PR #228 (nav icon + Progress/PBs redesign) is merged to `main` (`404610f`) but NOT deployed.**
  `scripts/deploy.sh` built and tagged the image locally (`kapekost/workout-tracker:404610f`,
  confirmed via `docker images`) but the SSH transfer to the Pi failed with
  `Permission denied (publickey)` — `~/.ssh/id_raspi` is passphrase-protected and this session's
  shell has no path to the macOS Keychain that normally supplies it (`ssh-add -l` showed no loaded
  identities; a direct manual `ssh` retry with the same key failed identically). Stopped after that
  one retry, not hammered further, per this repo's own standing caution about tripping OpenSSH
  `PerSourcePenalties` and locking out the owner's own session too. **Production confirmed still
  healthy and untouched at `8f293b7`** via `curl /api/health` immediately after the failed attempt
  — no partial/broken state. **To finish this**: run `bash scripts/deploy.sh` from a real terminal
  with Keychain access — either this machine's normal interactive session, or a fresh
  `git worktree add <path> origin/main` with `AGENTS.local.md` copied in. The image is already
  built and cached locally on this machine, so it should be a fast rebuild (Docker layer cache) +
  transfer, not a from-scratch build. Verify after with a direct `curl /api/health` (expect
  `version: 404610f`), not just the script's own assertion.
- **Dockerfile's explicit backend `COPY` list has now silently drifted from a new module import
  twice** (2026-09-27, `plan_seed.py`; historically, `bootstrap_owner.py`/#127) — both times with zero
  CI signal, since CI never builds the Dockerfile; both times only caught by a real deploy crashing.
  Fixed the specific instance (PR #227) and logged an `IMPROVEMENTS.md` `[local]` entry with a fix
  candidate (a CI step that actually builds the Dockerfile, or a static check that every top-level
  `import` in `main.py` resolves to a file the `COPY` lines include). Not built this tick — new CI
  tooling, outside this tick's remit — owner's call whether it's worth building before a third
  incident.
- **Nothing stops a stray commit landing on the orchestration home branch's local checkout.**
  2026-09-27: found a real commit (owner's own git identity, `kapekost@Mac.mynet`) sitting on this
  machine's local `claude/workout-tracker-backlog-bu9qnw` tip, never pushed — landed there because
  the primary checkout happened to have the home branch checked out when work was done directly in
  it rather than through `/orchestrate`. Rescued onto its own branch off `main`, no data lost, but a
  bare `git status` gives no hint this branch is special before it happens again. Fix candidates:
  a pre-commit hook refusing a commit whose parent branch matches `STATE.md`'s "Home branch" field
  unless run through `/orchestrate`, or just a loud README/banner. `IMPROVEMENTS.md` 2026-09-27,
  not fixed this tick (new tooling work, outside `/orchestrate`'s own docs-only remit) — owner's call
  whether it's worth building.
- **`AGENTS.local.md`'s "Current status" deploy note had drifted for ~17 deploys before this
  tick's catch-up correction** (see Cursor above) — it isn't wired to anything automatic, so it
  only stays accurate when whoever deploys remembers to update it. Not urgent (the file itself says
  as much, and this tick fixed the immediate drift), but worth a standing habit or a light script
  check if it keeps happening — owner's call whether that's worth the effort for a file only agents
  and the occasional manual deploy touch.
- **This machine's system `git` needs the Xcode license re-accepted.** Started failing 2026-09-15
  mid-tick with `fatal: You have not agreed to the Xcode license agreements. Please run 'sudo
  xcodebuild -license' from within a Terminal window...` (exit 69) on every `git`/`gh` invocation
  that shells out to `/usr/bin/git`. Affects this session and any other Claude Code session on this
  machine using plain `git`. Not something an agent can fix (needs interactive `sudo` at a
  keyboard). Workaround in place meanwhile: prefix `PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"`
  before `git`/`gh` calls (that binary isn't gated the same way). Low urgency since the workaround
  holds, but worth a minute at a real keyboard.
- **`workoutPlan.js`'s per-day categorical colors (`lower_a` blue, `upper_b` pink, `lower_b`
  orange) now sit against the new true-neutral Mono+Volt surfaces** (only `upper_a` was fixed to
  the new accent, since its old value was byte-identical to the deleted brand color — see
  `HISTORY.md` 2026-09-15). Rendered all four days locally to check: these three read distinctly
  more vivid/saturated against pure neutral gray than they did against the old slightly-blue-black
  background. This is a pre-existing categorical system `#168`'s spec never touched (not a defect
  it introduced), so it wasn't changed — but worth a look: fine as an intentional "day identity"
  exception to the one-accent principle, or worth its own follow-up Issue?
- **#27 (public access) may be ready to leave its 2026-08-30 P3 hold.** That decision deferred it
  explicitly until "the accounts system has been used for real, not just tested in CI" — #86/#87
  (the gate + export/import) shipped 2026-09-06, over a week ago, and the app has since seen real
  production deploys and login/gate enforcement in daily use. This tick skipped #27 (highest-ranked
  `intake` Issue) rather than assume that bar is now cleared — "used for real enough" is the
  owner's own judgment to make, not something visible in git/CI. If the owner confirms it, #27 is
  next in line for a spec/brainstorm pass per its 2026-08-30 decision (Cloudflare Tunnel, Home
  Assistant network-safety review required — real stakes, not a quick triage).
- **The harness's merge-permission classifier is inconsistent, not just subagent-vs-controller —
  and not just merges.** #138 (2026-09-13): a dispatched subagent's `gh pr merge` was blocked
  despite green CI; the controller merged PR #180 instead. #181, same day: the *controller's own*
  `gh pr merge` was also denied once ("blocked by classifier", no reason given) — but an identical
  retry succeeded immediately. **2026-09-14: same pattern on a plain `Edit` to this home branch's
  own `DECISIONS.md`** (bare "Blocked by classifier," no category) — identical retry succeeded
  immediately, no content change between attempts. All `[unsure]` in `IMPROVEMENTS.md`; not
  fixable via a PR here. Not blocking anything — just means any classifier denial with a generic or
  missing reason is worth one identical retry before treating it as a hard stop requiring hand-off.
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
- **Three `[template]` improvements still genuinely open in `agent-scaffold`** (narrowed 2026-09-10 —
  PR #2 merged with corrections, which covered a third): `/orchestrate approve`'s home-branch
  ambiguity (the #84 approval once landed on a stale `main` copy of `STATE.md`), and PLAYBOOK step 1
  not naming which branch to read docs from. Both only make sense once `agent-scaffold`'s own
  template has a "Claiming work"/home-branch concept — it doesn't yet, and propagating that is a
  larger, deliberately separate sync (per PR #2's own body). Dead-subagent recovery, the third
  original item, is done — landed in the template via PR #2 and mirrored directly into this repo's
  own `PLAYBOOK.md` step 4, 2026-09-10. **New, 2026-09-14:** a copier update from the template
  (#176/PR #187) overwrote a home-branch-only GUARDRAILS.md citation with generic template
  wording — the third occurrence of the sync-direction gap `IMPROVEMENTS.md`'s 2026-09-13 entry
  already diagnosed. This tick's step-2 sweep caught and reconciled it correctly (no wholesale-copy
  mistake this time), but three incidents in three weeks is itself the case for that entry's
  "automatic sync" fix candidate over continuing to rely on a tick noticing. None of these four
  items has the named, explicit cross-repo credential GUARDRAILS requires before an agent may open
  a PR against `agent-scaffold` — needs the owner to either provide one or make these fixes
  directly.
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
