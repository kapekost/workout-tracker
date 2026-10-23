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
- **Current focus:** #389 (personal best comparison, schema v10) is in a PR on `feat/pb-comparison-389`; it must not deploy until the owner's backup and export (Needs owner). Live is `f0c4cd5` (main; schema v9), deployed 2026-10-23 (version stamp only; #269 PR 1 changed review scripts, not the app). Before that, `1bc08a8` carried the React 19.3.1 bump. Plan days can be added, renamed, removed and reordered through `/api/plan/days` (backend only, no screen uses it yet). `/api/health` reported `1bc08a8` and the live login page loads with that stamp. No logged-in call against the live site. Frontend tests need Node 22.22.2 or newer (jsdom 30); see AGENTS.md. The owner's standing rule (2026-10-22): test locally before the merge, merge, then deploy from `main` and check the live URL.
- **Next action:** merge the #389 PR once its checks and review are clean, then stop there (deploy waits on the owner). Dependabot #405 and #269 PR 2 (#479, #480) have merged. Apply the #269 change to kapekost-web in its own PR. Item 7 (reviewer privacy order) is its own PR. Then mobile #410 to #412 (S, batch), the old-PR review audit (#459), the mobile children #413 to #419. #431 is owned by another session in worktree `icons-431`; do not pick it. The coach tickets #444 to #450 stay `intake` until triaged and follow the decisions in `DECISIONS.md` (2026-10-22); #448 and #446 need the runner provider detail first. Owner calls waiting: #432, #433.
  The #177 follow-ups are Issues #398 to #403.

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#389** — claimed 2026-10-23, live session. Branch `feat/pb-comparison-389`, one PR that also carries this claim.

## Needs owner
- **Coach key.** The owner has set the spend cap. Free models only for the first versions (`DECISIONS.md`,
  2026-10-22 later). The owner creates and hands over the key when the runner work starts; the agent never
  handles the value.
- **Rank the coach tickets (#444 to #455) on the board** if the default order is not wanted. They are on the board as Todo and stay `intake` until triaged.
- **#389 backup snapshot, then deploy.** Opt-in and anonymous (see `DECISIONS.md`). The PR brings schema v10. Before the deploy: run `scripts/backup.sh` on the host and take an admin `GET /api/export`. The agent then deploys from `main`. After it, the owner ticks the box on Personal Bests; the line stays hidden until 3 other members have opted in.
- **Stray settings commit `9727f63` on `main`.** An agent chain run in the wrong directory committed the owner's `/permissions` edit (removed the `Read(./data/**)` deny from `.claude/settings.json`) and pushed it under a deploy.sh message. Owner chose to leave it. The deny is gone from the tracked file, so agents can read `frontend/src/data/`.
- **CI reviewer model fallback policy (#269 item 7).** `DECISIONS.md` (2026-10-22 later) lets the list prefer
  private models and fall back to any free model. How far the fallback may go (which models, for which PRs)
  is the owner's call. Not acted on.
- **Dockerfile `COPY` drift check.** Whether to add a CI step that builds the Dockerfile (see Standing) is the
  owner's call. Not acted on.
- **Stale local branches.** Several local branches do not contain `main`; list them with
  `git branch --no-contains main` in the shared checkout. The sessions that found them made none of them,
  so they deleted none. Their owners or the owner should say which are safe to remove.
- **#27 (public access)** may be ready to leave its P3 hold; "used for real" is the owner's call.
  If yes, it needs a spec pass (Cloudflare Tunnel, Home Assistant network-safety review).

- **Live smoke test.** Agents have no login, so every deploy ends "health ok, behaviour not verified". A
  throwaway smoke-test profile would fix that but is an auth and secrets topic. Proposal only; no implementation.

- **Unsure improvement items.** The permission rules around `AGENTS.local.md` and the missing "skipped" stage in `orch-checkpoint.sh` (a docs-only merge reads as deployed) are logged in `IMPROVEMENTS.md` as `[unsure]`; say if either is worth a change. Also `[unsure]`: `deploy.sh` needs `AGENTS.local.md` in its own checkout and a worktree cannot get a copy, so deploys fast-forward the shared checkout.

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
