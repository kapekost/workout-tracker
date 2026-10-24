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
- **Current focus:** none claimed. #535 is done in both repos: the review poster blocks only on a finding whose line is on the diff and whose snippet is in that file's patch (workout-tracker PR #547, `957655c`, deployed, `/api/health` reports `957655c`; kapekost-web PR #119, `ed24caa`, merged on green, no host deploy for the script). #422 (daily backup, skip when unchanged, keep newest 2) is merged (`72c04df`, PR #542) but not deployed: the deploy was denied by the auto mode classifier, and the daily schedule is not installed yet. #389 (personal best comparison, schema v10) is merged (`bcd32bb`) and deployed 2026-10-23: live was `2ce2216` before the 2026-10-24 deploys (`main`; schema v10, `share_bests` 0 for the one profile). Verified: `/api/health` reports `2ce2216`, the migration ran, container logs clean. Not driven behind the login, no restart-twice check, no admin export (the host backup of 19:10 UTC, local and off-site `ok`, was the snapshot). Plan days can be added, renamed, removed and reordered through `/api/plan/days` (backend only, no screen uses it yet). Frontend tests need Node 22.22.2 or newer (jsdom 30); see AGENTS.md. The owner's standing rule (2026-10-22): test locally before the merge, merge, then deploy from `main` and check the live URL.
- **Next action:** finish #422 on the host: deploy `72c04df` from `main` (the owner allows `scripts/deploy.sh` or runs it), check the live URL, take a manual snapshot, install the daily schedule, confirm one scheduled run, then update the 'No cron' and 8-day lines in `AGENTS.local.md`. Then in kapekost-web, check whether "Allow GitHub Actions to create and approve pull requests" is on; if so its "approvals are off" poster comment is stale. Then the mobile parity series: #521 foundations is merged (#531); #522 (Home, with Resume) has its plan merged (#544, `docs/superpowers/plans/2026-10-24-mobile-home-parity-522.md`), so execute it next (the plan tick closed it by mistake; reopened 2026-10-24), then #523 to #529, one PR each, each merged after a web-render review, with the Expo Go phone check deferred until an emulator exists (`DECISIONS.md` 2026-10-24 later; standing approval for #521 to #529). No simulator is installed. After it: #417 (notifications; needs a device or simulator) and #419 (EAS config; iOS needs the owner's Apple account). #413 to #416 and #418 are merged; `mobile/` has no CI job yet, so add one (`npm test`, `npx expo lint`, `npx tsc --noEmit`). The five small gaps from the #459 audit are in #495. Reviewer follow-up: #536 (unreadable review input; recount once PRs opened after #516 and #532 have been reviewed). #431 is owned by another session in worktree `icons-431`; do not pick it. The coach tickets #444 to #450 stay `intake` until triaged and follow the decisions in `DECISIONS.md` (2026-10-22); #448 and #446 need the runner provider detail first. Owner calls waiting: #432, #433.
  The #177 follow-ups are Issues #398 to #403.

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#522** — claimed 2026-10-24T20:35Z, scheduled routine.

## Needs owner
- **#422 host steps.** Merged, not deployed. Run `scripts/deploy.sh` from the main checkout, where the allow rule applies (the classifier denied it on 2026-10-24), or run it yourself. Until then the host runs the old script and no daily schedule exists, so backups stay manual.
- **#422 backup strategy.** A review is on the Issue (2026-10-24 16:15Z): A keep the daily cron and prune the remote, B stay manual with three small changes, C cloud snapshots if the app moves. The Issue stays open until the owner chooses. Gaps found either way: the off-site copy is not pruned, and the 2-day `stale` threshold assumes a schedule.
- **Coach key.** The owner has set the spend cap. Free models only for the first versions (`DECISIONS.md`,
  2026-10-22 later). The owner creates and hands over the key when the runner work starts; the agent never
  handles the value.
- **Rank the coach tickets (#444 to #455) on the board** if the default order is not wanted. They are on the board as Todo and stay `intake` until triaged.
- **#389 opt-in.** Deployed. The owner ticks the box on Personal Bests; the line stays hidden until 3 other members have opted in, which is correct, not a failed deploy.
- **Stray settings commit `9727f63` on `main`.** An agent chain run in the wrong directory committed the owner's `/permissions` edit (removed the `Read(./data/**)` deny from `.claude/settings.json`) and pushed it under a deploy.sh message. Owner chose to leave it. The deny is gone from the tracked file, so agents can read `frontend/src/data/`.
- **Dockerfile `COPY` drift check.** Whether to add a CI step that builds the Dockerfile (see Standing) is the
  owner's call. Not acted on.
- **Stale local branches.** Several local branches do not contain `main`; list them with
  `git branch --no-contains main` in the shared checkout. The sessions that found them made none of them,
  so they deleted none. Their owners or the owner should say which are safe to remove.
- **One `[unsure]` improvement (2026-10-24).** The auto mode classifier denied `scripts/deploy.sh` although the exact-command allow rule exists in the main checkout's gitignored `.claude/settings.local.json`. Worktrees and sandboxes do not get that file; cause not confirmed. See `IMPROVEMENTS.md`.
- **#27 (public access)** may be ready to leave its P3 hold; "used for real" is the owner's call.
  If yes, it needs a spec pass (Cloudflare Tunnel, Home Assistant network-safety review).

- **Live smoke test.** Agents have no login, so every deploy ends "health ok, behaviour not verified". A
  throwaway smoke-test profile would fix that but is an auth and secrets topic. Proposal only; no implementation.

- **Unsure improvement items.** The permission rules around `AGENTS.local.md` and the missing "skipped" stage in `orch-checkpoint.sh` (a docs-only merge reads as deployed) are logged in `IMPROVEMENTS.md` as `[unsure]`; say if either is worth a change. Also `[unsure]`: macOS has no `timeout`, and the secret-guard hook blocks reading the live version over SSH (use the LAN health URL). Also `[unsure]`: `deploy.sh` needs `AGENTS.local.md` in its own checkout and a worktree cannot get a copy, so deploys fast-forward the shared checkout.

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
