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
- **Current focus:** Live-session tick, 2026-09-14. `#157` is still the only `ready` Issue and
  still unapproved (destructive, skipped again). Reconciled `PLAYBOOK.md`/`GUARDRAILS.md` drift
  from the prior tick's `#176` copier update (PR #187 had refreshed `main` from the template,
  diverging it from this home branch again) — hunk-by-hunk, both directions this time: two
  `PLAYBOOK.md` hunks adopted `main`'s newer template wording (PR onto the home branch), one
  `GUARDRAILS.md` hunk restored this home branch's more substantive repo-specific citation onto
  `main` (PR #188). Logged as a `[template]` `IMPROVEMENTS.md` entry — third occurrence of an
  already-diagnosed sync-direction gap; see Needs owner.

  Took the intake track since `ready` was blocked. Skipped `#27` (highest-ranked `intake`) rather
  than assume its 2026-08-30 P3 hold has cleared — flagged for the owner, see Needs owner. Next
  highest, `#164` (animation), turned out to need real scope decisions its own body already
  flagged (full sweep vs. first pass; bundle with `#152`/`#168` or not) — asked the owner live
  rather than mark `needs-clarification` and stop, since this is an attended session. Owner chose
  full sweep + bundle all three. Ran `superpowers:brainstorming` (architectural path, visual
  companion) through to a written, owner-approved spec:
  [`docs/superpowers/specs/2026-09-14-visual-polish-design.md`](https://github.com/kapekost/workout-tracker/blob/main/docs/superpowers/specs/2026-09-14-visual-polish-design.md)
  (PR #189) — a "Mono + Volt" palette/type/surface token swap, a vendored + custom icon system
  (full sweep, inventory table in the spec), and a motion system (bottom-sheet modal, route
  crossfade). Spec self-review caught and corrected one real inconsistency before merge: an
  initially-approved centered-dialog confirm pattern assumed a modal that doesn't exist — the app
  actually uses an established tap-again-to-confirm button pattern for all destructive actions,
  which this spec explicitly leaves untouched. `#164`/`#152`/`#168` stay `intake`, now
  spec-linked via comments, pending a future split into `ready` children.

  **Follow-up, same conversation, after the owner read the spec:** "verify visually on the browser
  and review with a UI and a UX expert" — split the standing 2026-09-06 UI gate's single combined
  "UI/UX review" into two separate expert passes, repo-wide (`PLAYBOOK.md` step 5, `DECISIONS.md`
  2026-09-14). Cherry-picked onto `main` and spelled out explicitly in the spec's Verification
  section (PR #190, merged green) since this workstream is what prompted it.
- **Next action:** ready queue is still just `#157` (unapproved). Next tick: split
  `#164`/`#152`/`#168` into `ready` children against the new spec (highest-ranked spec-backed
  intake work), or check whether the owner acted on `#157`/`#27` first.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
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
