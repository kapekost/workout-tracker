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
- **Current focus:** live is `50742e6` (schema v7). The owner's standing rule: deploy once
  verified and ready to merge, check the live URL, then merge.
- **Next action:** #148 (failed logout kept and retried, #336) and #236 (design-review findings
  split into Issues, e.g. #340, #345, #350) are done. #335 sets the rule that a low-risk
  auth/session change needs an expert review, not the `approved` label. #337 and #338 put the
  in-app changelog rule in the PLAYBOOK and make CI require an entry for app-code PRs. The #165
  audit is `docs/superpowers/research/2026-10-11-workout-entities-audit.md`; #173 was split into
  #351 and #352 (intake, P3). Queue in progress: #197/#345/#196 (cues modal), #339 (Log Set
  idempotency, schema), #341-#344/#348/#349 (token and nav sweep), #171 (workout-science agent),
  #177 (plan-edit v1 plan). #269 has only items 3 and 5 left, both speculative. #296 is verified
  by the first real PR. `main` through #336 is deployed; #337 and #338 change no app behaviour.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(none)

## Needs owner
- **Design-review decisions (`needs-clarification`):** #340 (Finish Workout: confirm tap,
  un-finish, or neither) and #350 (Wave 4 items). Agents do not pick.
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
