# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** (none in flight — #24 shipped via #53; #38 shipped via #55; #21 shipped via
  #58; #22 shipped via #59; #34 shipped via #61 (all 2026-08-30); #27, #29-30, #32-33 (intake)
  remain)
- **Next action:** No other `ready`, unblocked work remains. #23 is `ready` but needs real
  engineering work, not a quick try (see Needs owner). The `intake` ones (#27, #29, #30, #32,
  #33) need owner answers first — #27's direction is actively being discussed with the owner.

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

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
- **2026-08-30 (#34 → #61):** Shipped. `scripts/deploy.sh` wraps the existing
  build→transfer→restart→verify runbook into one command, reading `DEPLOY_HOST`/
  `DEPLOY_APP_DIR`/`DEPLOY_SSH_OPTS` from a new `AGENTS.local.md` section instead of hardcoding.
  Adapted from a solid, complete draft found on the abandoned `tmp/repair-38-stacked-9` branch
  (see the #38 tick's orphaned-branch finding below) rather than written from scratch — fixed
  one real bug in it: the remote `docker compose up` step wasn't setting `APP_COMMIT`, so it
  would've silently deployed `:latest` instead of the built commit. `code-review` skill (run
  with an explicit path/target this time) caught a second real bug before shipping: the first
  draft of `AGENTS.local.md.example`'s own documentation broke the script's config parser (its
  fenced example repeated the section heading, truncating the `sed` range before the actual
  variable lines). Both fixed and verified — including against the real shipped `.example` file,
  not just a synthetic test fixture — before merging. All 3 checks green, merged squash.

  **Near-miss, worth the full story:** while this was in progress, the recurring routine (set up
  earlier this session) fired for the first time on its normal schedule and independently picked
  #34 too, in its own separate session — checked out the same branch, was about to make redundant
  edits. Caught via `get_session` (prompted by the owner asking "won't they clash?") and
  interrupted before it pushed anything: no git damage, but real cost wasted on now-discarded
  duplicate work. **Resolved same tick:** owner decided against relying on remembering to toggle
  the routine — `PLAYBOOK.md` gained a real "Claiming work" mechanism instead (a tick pushes an
  In-flight claim to `claude/workout-tracker-backlog-bu9qnw` the instant it picks an Issue,
  *before* any execution; other ticks check that live branch first and back off on a fresh claim;
  git's own push-rejection on a non-fast-forward is what actually enforces it, not just
  cooperative reading). Logged as a standing decision in `DECISIONS.md`. The routine itself stays
  disabled for now — nothing stops the owner re-enabling it whenever unattended coverage is
  wanted again; that's now safe to do.
- **2026-08-30 (#22 → #59):** Shipped. Coordinated `vite` 5→8.2.2, `@vitejs/plugin-react` 4→6.1.1,
  `vitest` 1→4.1.11 bump; lockfile deleted and regenerated fresh rather than hand-merged. Branched
  before #58 landed, so PR #59 conflicted with `main` on the same two files (`package.json`,
  `package-lock.json`) — resolved cleanly (non-overlapping `dependencies`/`devDependencies` lines,
  git's 3-way merge needed no manual edits) and the *combined* react-19 + vite-8 + vitest-4 state
  was fully re-verified together (212/212 unit, 14/14 Playwright, prod build, real backend +
  built-`dist/` smoke test, 69/69 backend pytest sanity check) — no interaction issues found.
  Real finding, not just an unverifiable gap: vite 8 defaults to the Rolldown bundler, adding a
  *new* family of per-platform optional native bindings — same bug class as the Rollup/Alpine
  issue this repo already hit once (`efd88ca`). Noted in `AGENTS.md`'s Gotchas section for the
  next real `docker buildx build` to watch for. Owner explicitly decided to merge without a
  literal Docker build (blocked in-sandbox by org egress policy, confirmed 3×) since merging to
  `main` isn't a deploy here — the real Mac build machine remains the actual gate. Dependabot PRs
  #13/#16 closed, pointing at #59.
- **2026-08-30 (#21 → #58):** Shipped. Coordinated `react`+`react-dom` bump to 19.2.8 — zero source
  changes needed (already on `createRoot`, no legacy patterns), zero other packages needed
  bumping (`react-router-dom`/`@testing-library/react`/`recharts` peer ranges already covered
  19). 212/212 unit, 14/14 Playwright, prod build, real backend + built-`dist/` smoke test all
  green. Literal `docker buildx build` blocked by this sandbox's org egress policy (Docker Hub
  CDN denied) — Dockerfile itself untouched by this PR, so merged on the strength of the rest;
  flagged in the PR for a real build-machine verification at the next deploy regardless.
  Dependabot PR #14 closed, pointing at #58.
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
