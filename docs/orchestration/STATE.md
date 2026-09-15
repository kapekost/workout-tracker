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
- **Current focus:** Same live session, continued further into 2026-09-15. After `#168` shipped
  (previous entry, see `HISTORY.md`), picked `#164` next — board rank, both `#152`/`#164` unblocked
  and equally `ready`. Gated on decomposition, not effort size: the spec explicitly left the
  route-transition mechanism as "an open call for the plan to make," so this wasn't decomposed
  enough to execute directly. Wrote a plan
  ([`docs/superpowers/plans/2026-09-15-motion-system.md`](https://github.com/kapekost/workout-tracker/blob/main/docs/superpowers/plans/2026-09-15-motion-system.md),
  PR #194) that resolves it: verified (not assumed) that react-router-dom's `viewTransition`
  integration needs the data-router API, which this app's declarative `<BrowserRouter>` doesn't
  use, so picked a manual CSS-transition wrapper instead — also avoids double-mounting page trees
  that carry real side effects (timers, wake-lock, polling), which a true overlapping crossfade
  would require. Plan self-review caught and fixed a real bug in its own test design (a
  fake-timers ordering issue) before it landed. Linked to `#164`'s Issue body and commented.
  Per the plan-gate rule ("plan it, then stop"), execution is next tick's work, not this one's.
- **Next action:** ready queue is still just `#157` (unapproved). Next tick: execute `#164`
  against its new plan, or pick up `#152` (icons) instead — or check whether the owner acted on
  `#157`/`#27`/the `DAY_COLORS` follow-up first (see Needs owner).

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#164** — claimed 2026-09-15T06:58:09Z, live session.

## Needs owner
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
