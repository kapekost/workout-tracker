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
- **Current focus:** live is `1b1284d` (schema v7), deployed 2026-10-11. #229 shipped (PRs #267, #319).
  Housekeeping after the 2026-10-11 owner decisions (see `DECISIONS.md`).
- **Next action:** none ready and unblocked. #269 has only items 3 (big diffs: stat and "reviewed N
  of M files") and 5 (label gate on re-review) left. Both are speculative: binaries already show as
  one line in `pr.diff`, the poster already reviews only the diff since its last review, and no big
  PR has failed since the 900 s cap and the fallbacks. Build them when a review actually skips, or
  fold them into #292 (requests per review). Items 1, 2, 4, 6 and the timeout label (#327) are done.
  #317 (#325) and the kapekost-web model-list sync (kapekost-web#95) are done. #322 (backend),
  #323 and #327 (review workflow) and #325 (frontend) are on `main` but not deployed.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(none)

## Needs owner
- **Close kapekost-web#92.** Superseded by kapekost-web#95; its third model
  (`inclusionai/ling-3.0-flash-sante:free`) is not listed by OpenRouter.
- **Create the limited OpenRouter key** for the reviewer. In the OpenRouter dashboard: new key,
  credit limit set low (or credits that cannot charge extra), free models only, then store it as the
  repo secret the review workflow reads. The agent never handles the key value.
- **#30/#32 need a spec skim, not a decision.** `docs/superpowers/specs/2026-08-31-ai-structured-io-design.md`
  gates itself on an owner skim before either Issue is split. #33 merged into #32; #171 (domain
  agents) lands before #32 is sequenced. The spec needs those folded in first. Both stay `intake`.
- **#27 (public access)** may be ready to leave its P3 hold; "used for real" is the owner's call.
  If yes, it needs a spec pass (Cloudflare Tunnel, Home Assistant network-safety review).
- **Dockerfile `COPY` list can drift from a new module import** with no CI signal (twice so far).
  A CI step that builds the Dockerfile, or a static import check, would catch it. Owner's call.
- **Per-day colors in `workoutPlan.js`** (`lower_a`, `upper_b`, `lower_b`) read vivid against the
  Mono+Volt surfaces. Keep as intentional day identity, or file a follow-up?
- **Three `[template]` improvements** for `agent-scaffold` need a cross-repo credential per
  GUARDRAILS before an agent may open a PR there. See `IMPROVEMENTS.md`.
- **`deploy.sh` `eval`s a gitignored file** its dirty-tree gate cannot see; the container runs as
  root with no compose limits and unhashed requirements.
