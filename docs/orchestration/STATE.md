# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** (none in flight — 8 `intake`/`ready` Issues remain from the 2026-08-26
  backlog migration: #29-30, #32-36, all still open)
- **Next action:** Highest-ranked `ready` Issue is #34 (scripted one-command deploy); the
  `intake` ones (#29, #30, #32, #33) need owner answers first.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **#21/#22 (coordinated dependency bumps)** and **#23** (node:20→26-alpine breaks the actual
  Docker build despite green CI) are `ready` but genuinely need the coordinated work described
  in each — not something to pick off piecemeal via the individual Dependabot PRs (#14, #16,
  #13, #7), which were deliberately left open/unmerged during the 2026-08-30 catch-up pass.
- **#24** (no CI actually runs the backend test suite) is P1 — worth prioritizing, since it
  means backend-only dependency bumps have been merging without real coverage.

## Tick log
- **2026-08-30 (catch-up pass):** Reviewed 6 open Dependabot PRs. Merged #41 (recharts) and
  #40 (@testing-library/jest-dom) — green, no known blockers. Left #14/#16/#13/#7 open:
  each is individually broken for reasons already correctly diagnosed in #21/#22/#23 (peer-dep
  conflicts needing coordinated bumps; #7 passes CI but fails the actual `docker buildx build`).
  No action taken on #21-24 themselves — real engineering work, not a merge-queue item.
