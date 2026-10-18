# Orchestration State

> Single-owner cursor for `/orchestrate`. **Hard budget: ~250 lines.** Every tick reads this file
> first, so its cost is per-tick and compounding. It lives on `main` and changes through a
> short-lived branch and PR. The former home branch is retired; it is kept as the tag
> `archive/orchestration-home-2026-10-11` (full tick history in its `HISTORY.md`).
>
> **Project number:** 3
> **Project owner:** kapekost
>
> **This file keeps no Tick log.** Each tick's write-back goes to `HISTORY.md`, prepended at the
> top. Resolved Needs-owner items move to `HISTORY.md` the same way. `DECISIONS.md` is never
> compacted.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** live is `e460fde` (schema v9). `353a5b8` (2026-10-18, after a host backup, local and
  off-site `ok`) shipped the plan editor (#177 A-C), the plan export (#220), #369 and the Dependabot bumps;
  `a324a1d` and `e460fde` change copy only (Plan page; em dashes and wordy text, #388).
  Login page and footer checked in Chrome; nothing behind the login was driven. The owner's standing
  rule: deploy once verified and ready to merge, check the live URL, then merge.
- **Next action:** #221/#223 (AI export prompt and paste-back, `ready`), #294,
  #269 (items 3 and 5 only, speculative), #201. Follow-ups from the #177 reviews, to file as Issues
  once `gh` works: swap in place instead of at the end of the day (needs a backend position),
  focus management on the Plan page, a "Go to workout" link in its locked state, a test that really
  exercises the in-flight guard, a muscle-tag check in CI for catalog entries, and old growth/targeting
  wording in the seed (`plan_seed.py`, e.g. "calves grow under stretch").

## Stop-condition
(none — runner proceeds normally)

## In-flight
(none)

## Needs owner
- **Design-review decisions (`needs-clarification`):** #340 (Finish Workout: confirm tap,
  un-finish, or neither) and #350 (Wave 4 items). Agents do not pick.
- **#389 privacy choice.** Spec PR `docs/superpowers/specs/2026-10-18-pb-comparison-design.md`: opt-in vs
  opt-out, anonymous vs names. Recommended: opt-in, anonymous. Not implemented until you choose.
- **Cue copy deny rule.** `frontend/src/data/workoutPlan.js` is denied to agents. Its ~35 cue em dashes and
  the matching `backend/plan_seed.py` wording (#388) need you to allow it or do it.
- **Close kapekost-web#92.** Superseded by kapekost-web#95; its third model
  (`inclusionai/ling-3.0-flash-sante:free`) is not listed by OpenRouter.
- **Create the limited OpenRouter key** for the reviewer. In the OpenRouter dashboard: new key,
  credit limit set low (or credits that cannot charge extra), free models only, then store it as the
  repo secret the review workflow reads. The agent never handles the key value.
- **#27 (public access)** may be ready to leave its P3 hold; "used for real" is the owner's call.
  If yes, it needs a spec pass (Cloudflare Tunnel, Home Assistant network-safety review).

## Standing, not blocking
- **#30/#32 need a spec skim, not a decision.** `docs/superpowers/specs/2026-08-31-ai-structured-io-design.md`
  gates itself on an owner skim before either Issue is split. #33 merged into #32; #171 (domain
  agents) lands before #32 is sequenced. The spec needs those folded in first. Both stay `intake`.
- **Dockerfile `COPY` list can drift from a new module import** with no CI signal (twice so far).
  A CI step that builds the Dockerfile, or a static import check, would catch it. Owner's call.
- **Per-day colors in `workoutPlan.js`** (`lower_a`, `upper_b`, `lower_b`) read vivid against the
  Mono+Volt surfaces. Keep as intentional day identity, or file a follow-up?
- **Three `[template]` improvements** for `agent-scaffold` need a cross-repo credential per
  GUARDRAILS before an agent may open a PR there. See `IMPROVEMENTS.md`.
- **`deploy.sh` `eval`s a gitignored file** its dirty-tree gate cannot see; the container runs as
  root with no compose limits and unhashed requirements.
