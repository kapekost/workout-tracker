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
- **Current focus:** live is `088170f` (schema v9; Dockerfile now builds for amd64 and arm64 and carries a container health check, #442; app behaviour unchanged since `6f397bf`). The host shows the container `healthy`, and `/api/health` reports `088170f`. No browser check of the live site was done; this change touched no app code. The owner's standing rule: deploy once verified and ready to merge, check the live URL, then merge.
- **Next action:** #430 and #431 (flexible split, ready), then mobile #410 to #412 (S, batch), #269 (items 3 and 5 only), the old-PR review audit (#459), the rest of the mobile children #413 to #419. The coach runner and API tickets #444 to #450 follow the decisions in `DECISIONS.md` (2026-10-22); #448 and #446 need the runner provider detail first. Owner calls waiting: #432, #433.
  The #177 follow-ups are Issues #398 to #403.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(none)

## Needs owner
- **Coach key.** The owner has set the spend cap. Free models only for the first versions (`DECISIONS.md`,
  2026-10-22 later). The owner creates and hands over the key when the runner work starts; the agent never
  handles the value.
- **Rank the new coach tickets (#444 to #455) on the board** if the default order is not wanted.
- **#389 backup snapshot.** Decided opt-in and anonymous (see `DECISIONS.md`). Next is a plan, then a schema
  v10 change; run `scripts/backup.sh` on the host and take an admin export before that deploy.
- **Stray settings commit `9727f63` on `main`.** An agent chain run in the wrong directory committed the owner's `/permissions` edit (removed the `Read(./data/**)` deny from `.claude/settings.json`) and pushed it under a deploy.sh message. Owner chose to leave it. The deny is gone from the tracked file, so agents can read `frontend/src/data/`.
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
