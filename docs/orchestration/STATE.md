# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** (none in flight — #24 shipped 2026-08-30 via #53; #27, #29-30, #32-33 (intake)
  and #34, #38 (ready) remain)
- **Next action:** Remaining `ready` chores are #34 (scripted one-command deploy) and #38
  (document the shipped Personal Bests feature); the `intake` ones (#27, #29, #30, #32, #33) need
  owner answers first. #36 (heartbeat cron) is done — closed 2026-08-29, this file just hadn't
  caught up.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **#21/#22 (coordinated dependency bumps)** and **#23** (node:20→26-alpine breaks the actual
  Docker build despite green CI) are `ready` but genuinely need the coordinated work described
  in each — not something to pick off piecemeal via the individual Dependabot PRs (#14, #16,
  #13, #7), which were deliberately left open/unmerged during the 2026-08-30 catch-up pass.
  #21/#22 each carry an owner comment (2026-08-26): try the bump, proceed if it's low-effort,
  tell Dependabot to hold off for now if it isn't — not yet acted on.

## Tick log
- **2026-08-30 (#24 → #53):** Shipped. Added `backend-tests.yml` with an explicit `Backend tests`
  job name (frontend-tests.yml's job displays as plain `test`, which is what let backend-only
  Dependabot bumps merge on an unrelated green check). Supersedes #44, which was the same fix
  opened against a stale feature branch instead of `main` and closed same-day unexplained — #53
  is a clean rebase of it onto current `main`. All 3 checks green (`test`, `sanity`, `Backend
  tests`), merged squash, verified 69/69 backend tests locally first.
- **2026-08-30 (state reconciliation):** `/orchestrate status` found this file stale against
  live GitHub state: #36 was already closed (2026-08-29) but still listed above as open; #38
  (ready, opened 2026-08-26) and #27 (intake, opened 2026-08-26) were never reflected in the
  cursor. Corrected above — no code changes, just catching this file up to reality.
- **2026-08-30 (catch-up pass):** Reviewed 6 open Dependabot PRs. Merged #41 (recharts) and
  #40 (@testing-library/jest-dom) — green, no known blockers. Left #14/#16/#13/#7 open:
  each is individually broken for reasons already correctly diagnosed in #21/#22/#23 (peer-dep
  conflicts needing coordinated bumps; #7 passes CI but fails the actual `docker buildx build`).
  No action taken on #21-24 themselves — real engineering work, not a merge-queue item.
- **2026-08-30 (#35):** Shipped. `docker-compose.yml` reads the run tag from `$APP_COMMIT`
  instead of hardcoding `:latest`; `AGENTS.md`/`AGENTS.local.md` runbooks updated to match.
  Not yet deployed to the Pi — lands on the next real deploy.
