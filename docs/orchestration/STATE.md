# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** #23 shipped via #65 (2026-08-30). #29 triaged and closed, split into #66
  (schema/migration, `ready`), #67 (login, depends on #66), #68 (password reset via Resend,
  depends on #67), #69 (switcher UI, depends on #66). #27, #30, #32, #33 all triaged via live
  owner Q&A 2026-08-30 — real direction set on each, but none are `ready`: all need either a
  written spec (per each issue's own stated process) or to wait on #66/#67 landing, several both.
  #70 (cross-user competition/comparison screens) opened as a new, unshaped intake issue — a
  future idea that came up in passing during #30's triage.
- **Next action:** #66 is the next `ready`, unblocked pick — nothing else is pickable this
  moment. #67/#68/#69 need the `ready` label added by hand once their dependency merges
  (#67/#69 after #66, #68 after #67) — no native GitHub blocked-by relationship was set (no
  graphql-capable tool available this session), so this is a manual sequencing note instead.
  #27/#30/#32/#33 need an actual spec written (`docs/superpowers/specs/` convention) before they
  can be split/sized into `ready` work — direction is set, the writing isn't done. #70 needs a
  first triage pass (owner hasn't scoped it at all yet).

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **Orphaned branches, manual cleanup scheduled** — owner has the exact `git push origin --delete
  ...` command (given in chat 2026-08-30) covering the 12 branches from the abandoned prior
  attempt (`ci/24-backend-tests-temp2`, `ci/24-backend-tests-temp3`, `tmp/repair-38-stacked`
  through `-9`, `tmp/repair-final`) plus `claude/23-node26-docker-build` (newly merged via #65,
  same auto-delete gap — see the entry below). Will run it in ~2 days. The runner still can't do
  this itself: `git push --delete` 403s, no delete-ref tool in the GitHub MCP server.
- **Branch auto-delete-on-merge is silently broken** — not just manual deletion. Every future PR
  merged by this orchestration will leave its branch behind the same way #65's did, unless fixed.
  Real fix (recommended over widening the App's permissions): enable GitHub's native repo setting
  Settings → General → Pull Requests → "Automatically delete head branches" — runs outside our
  App's permissions entirely, so the 403 gap doesn't apply to it. Owner to verify/enable. See
  `DECISIONS.md`.
- **`[unsure]` IMPROVEMENTS.md entry (2026-08-30):** the `code-review` skill's forked execution
  silently reviewed the wrong attached repo (kapekost-web instead of workout-tracker) when
  invoked with no explicit target during the #38 tick. Not fixable via a PR in this repo or the
  template repo — looks like Claude Code harness/skill-runtime behavior. Flagging per PLAYBOOK
  step 8 rather than guessing at a fix.

## Tick log
- **2026-08-30 (#30/#32/#33 triage, #70 opened):** Further owner Q&A, same session as the #29
  split. #30 (Import): build full-session import (working interpretation of a slightly uncertain
  answer, flagged on the issue for correction), scoped per-profile; POC-simple idempotency (no
  dedup handling yet); add-only overwrite semantics except upsert-by-id when the imported record
  names a known ID. #32 (Adaptive coaching): v1 is manual export-a-prompt only (live API
  explicitly deferred); cadence is before/after only ("during" scoped out); "update" stays a
  simple layer above existing per-session nudging, not a `workoutPlan.js` restructure; AI output
  can propose real profile/plan updates but only after explicit user confirmation, never
  fabricated; sequenced behind the user system (#66/#67). #33 (Nutrition): collect both
  bodyweight *and* height (new scope beyond the original bodyweight-only ask); ships standalone,
  not folded into #32; also sequenced behind #66 since the new fields need real profiles. #30 and
  #32 independently converged on the same underlying shape — structured AI output, reviewed and
  confirmed, then written to real data — flagged on both issues as worth one spec pass
  considering together. A future "competition/comparison screens across users" idea came up in
  passing during #30's triage; captured as new intake issue #70 rather than lost, per this repo's
  Feature Intake convention. All four (#27/#30/#32/#33) stay `intake` — direction is real now,
  but each still needs an actual written spec before splitting into `ready` work. Logged in
  `DECISIONS.md`. No code changes — pure triage.
- **2026-08-30 (#23 → #65):** Shipped. Bumped the Dockerfile's builder stage `node:20-alpine` →
  `node:26-alpine` — same target Dependabot PR #7 proposed, actually investigated this time
  instead of rubber-stamped, per the issue's own instruction. Root cause per the issue: npm
  11.19.0 (bundled with `node:26-alpine`) resolving `frontend/package-lock.json`'s optional
  platform packages differently than npm 10.x, producing a false-green in CI (which never touches
  the Dockerfile). Investigated for real rather than assumed: this sandbox has no Docker daemon
  (same confirmed constraint as #21/#22), so downloaded a checksum-verified
  `node-v26.8.1-linux-x64` binary directly from nodejs.org and ran actual `npm ci` under its
  bundled npm 11.19.0 — against the current lockfile, against the exact pre-#59 lockfile that
  still contained the `@esbuild/aix-ppc64@0.21.5` entry named in the original error, and again
  with `--os=linux --cpu=x64 --libc=musl` forced to approximate Alpine. All three succeeded
  cleanly; `npm install --package-lock-only` under node 26 regenerated the lockfile byte-identical
  to what's committed. **Real finding: no lockfile regeneration was actually needed** — `esbuild`
  is no longer even resolved in the dependency tree since #59's vite 5→8 bump already regenerated
  the lockfile fresh, so PR #7's original failure likely doesn't reproduce outside the real
  Alpine/musl `buildx` environment. Noted in `AGENTS.md`'s Gotchas section. Verification: 212/212
  vitest, prod build + real backend/dist smoke test (200 on `/`, correct `/api/health`), 69/69
  backend pytest, lockfile reconfirmed installing cleanly under the sandbox's own node 22/npm 10
  too. Playwright e2e blocked in this sandbox by an unrelated egress-proxy 403 — flagged as
  session-to-session sandbox variance (not a permanent constraint like the Docker one; #21/#22 had
  it working same-day) — CI's own Playwright run on GitHub's runner was the real gate regardless.
  Literal `docker buildx build` verification remains impossible in-sandbox and is flagged for a
  spot-check at the next real deploy, same precedent as #21/#22. `code-review` skill run with an
  explicit target this time (per the #38-tick gotcha) — fixed one real finding (a duplicate
  12-line Dockerfile comment re-narrating the AGENTS.md entry, trimmed to a pointer), correctly
  did *not* act on an out-of-scope one (node 26 vs. 24 LTS choice — flagged as a possible separate
  issue, not this one's job). All CI green, merged squash. Dependabot PR #7 closed, pointing at
  #65.
- **2026-08-30 (#29 triage → #66/#67/#68/#69):** Resolved via live owner Q&A during an
  `/orchestrate status` + tick session. Profiles are real, isolated, data-owning accounts, not
  just a label — explicit prework for later Google/Apple OAuth (not built now, but the schema
  shouldn't preclude it). Existing data migrates to a seeded `kapekost` profile with `role:
  admin` (no admin-only behavior built yet, just the flag). Real login gate before Home, not a
  device-remembered switcher. v1 auth is username + hashed password with email-based reset —
  OAuth explicitly deferred. Emoji icons confirmed fine for now. Split into #66
  (schema/migration, `ready` now — foundational, nothing else depends on it), #67 (login, depends
  on #66, not yet `ready`), #68 (password reset via email, depends on #67, not yet `ready`), #69
  (switcher UI, depends on #66, not yet `ready`). #68's one open question (which email provider,
  since this repo has no existing email-sending capability) was resolved same-session: **Resend**
  (matches `kapekost-web`'s existing pattern), API key to live in `AGENTS.local.md` per this
  repo's "deployment knowledge stays local" convention. #30 and #32 (both still `intake`) had
  their "depends on Profiles (#29)" notes updated to point at #66 instead, since #29 is now
  closed. No native GitHub blocked-by relationship set on #67/#68/#69 (no graphql-capable tool
  available this session) — sequencing is a manual note in each issue body and above instead.
  Logged in `DECISIONS.md`. No code changes — pure triage.
- **2026-08-30 (#61 follow-up → #63):** Shipped. `scripts/deploy.sh`'s `/api/health` check ran
  exactly once immediately after `docker compose up -d --force-recreate`, which returns as soon
  as the container *starts*, not once uvicorn is actually accepting connections — a real race
  that could fail a perfectly good deploy. Caught by the recurring routine's now-archived session
  (see below), which had independently kept working #34 after being interrupted mid-collision and
  compared its own draft against the merged #61 script before stopping for good. Verified the gap
  against the actual merged code first rather than trusting the claim on faith — confirmed real.
  Fixed with a retry loop (~30s, 15×2s) inside the *same* SSH session rather than one connection
  per attempt. `code-review` caught two real issues in the first draft of the fix itself before
  it shipped: swallowed stderr on persistent (non-transient) failures, and per-attempt SSH
  reconnect overhead that would've made the "~30s" claim inaccurate — both fixed by moving the
  loop into the remote shell entirely. Retry logic verified standalone (extracted the exact
  remote snippet, ran it directly: fails-then-succeeds and always-fails cases both correct).
  Session `session_01GPKYsV68JuLWsrZCwLYyFa` archived after this — confirmed idle since the
  interrupt, never pushed its own fix (the branch it intended to push to was already merged and
  squashed by then anyway, so that plan was moot regardless), nothing salvageable left in it.
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
