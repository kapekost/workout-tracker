# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** (none in flight — #24 shipped 2026-08-30 via #53; #38 shipped 2026-08-30 via
  #55; #27, #29-30, #32-33 (intake) and #34 (ready) remain)
- **Next action:** Remaining `ready` chore is #34 (scripted one-command deploy); the `intake` ones
  (#27, #29, #30, #32, #33) need owner answers first.

## Stop-condition
(none — runner proceeds normally)

## In-flight
- **#21/#22 (coordinated dependency bumps)** — owner approved 2026-08-30: try each bump, keep it
  if low-effort, otherwise revert and tell Dependabot to hold off. Dispatched as two parallel
  subagents this tick.

## Needs owner
- **#23** (node:20→26-alpine breaks the actual Docker build despite green CI) is `ready` but
  genuinely needs real engineering work — not something to pick off via the individual Dependabot
  PR (#7), which was deliberately left open/unmerged during the 2026-08-30 catch-up pass.
- **Orphaned branches from an abandoned prior attempt** — owner approved deletion 2026-08-30, but
  the runner can't actually do it: `git push --delete` consistently 403s (looks like the GitHub
  App's permission set doesn't include ref deletion), and there's no delete-branch/delete-ref tool
  in the GitHub MCP server either. Needs the owner to delete these manually via the GitHub UI (or
  grant the App that permission): `ci/24-backend-tests-temp2`, `ci/24-backend-tests-temp3`,
  `tmp/repair-38-stacked-1` through `-9`, `tmp/repair-final` (11 branches). None referenced by an
  open PR, fully superseded by the clean #53 and #55 ships.
- **`[unsure]` IMPROVEMENTS.md entry (2026-08-30):** the `code-review` skill's forked execution
  silently reviewed the wrong attached repo (kapekost-web instead of workout-tracker) when
  invoked with no explicit target during the #38 tick. Not fixable via a PR in this repo or the
  template repo — looks like Claude Code harness/skill-runtime behavior. Flagging per PLAYBOOK
  step 8 rather than guessing at a fix.

## Tick log
- **2026-08-30 (owner check-in):** Owner reviewed the flagged items live. Decisions: (1) codify
  the intake-vs-ready sequencing precedent — `DECISIONS.md` entry added, `PLAYBOOK.md` step 3
  reworded to match; (2) delete the 11 orphaned branches — attempted, blocked by a GitHub App
  permission gap (see Needs owner); (3) proceed with #21/#22 now — dispatched below; (4) #27's
  direction still being talked through with the owner, not yet decided.
- **2026-08-30 (#38 → #55):** Shipped. Backfilled `docs/CHANGELOG.md` (in its correct
  2026-08-17 chronological slot, marked as written retroactively) and an `AGENTS.md`
  Design-docs bullet for the already-shipped Personal Bests feature — 5 commits verified
  against actual repo history first (`3eb468e`, `8af065e`, `82f164b`, `c1ff0ab`, `fd83851`),
  not just copied from the Issue body. Docs-only; `code-review` skill run on the diff (clean,
  no findings — note: its first invocation silently reviewed a different repo entirely in
  this multi-repo session, had to re-run with an explicit path/branch target to get a
  trustworthy result). All 3 checks green, merged squash. Also surfaced the orphaned-branch
  and intake-sequencing items now under "Needs owner" above.
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
