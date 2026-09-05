# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** **#110 (per-profile data isolation) shipped and deployed** (`240acc4`, PR #112,
  2026-09-05). Reads had never been scoped since #66, so any second profile would have seen the
  first's entire history; now every read and every mutation routes through one
  `acting_profile_id(conn)` seam (returns the seed profile today; #86 swaps its body for the session
  lookup and deletes `_default_profile_id`). 11 reads scoped, mutations 404 cross-profile by
  ownership, `/api/export` and `/api/import` left for #87. A table-driven leak test beside #84's
  open-gate test proves it and fails any future unscoped route; backend **183 green**, #84's
  open-gate test still green (the app ships still open). Deployed to the Pi and health-verified
  (`version=240acc4`, backups ok). One behaviour change: `DELETE /api/personal-bests/{id}` of a
  non-owned/missing row now 404s (was idempotent `{"deleted": true}`). **NOTE:** two-user isolation
  cannot be clicked through until #105/#86 add login (`acting_profile_id` returns the seed for every
  request today) — it is proven by the leak test on the deployed commit, not yet by a live
  multi-login. Executed inline by the controller after a subagent implementer was cut off mid-task by
  the account usage limit (its complete leak test was salvaged and committed); review was inline for
  the same reason.

  Accounts, **steps 1 and 2 of 5 shipped and deployed** (`c9442d8`). #84 (schema v6 + auth core) merged as
  `3ed18a4` (PR #103) — 152 backend tests (101 existing + 51 new) and 216 frontend tests green.
  Six TDD commits: schema v6 → bcrypt cost-12 helpers → session store and `wt_session` cookie →
  `current_profile` + `GET /api/auth/me` → `POST /api/auth/login` → `POST /api/auth/logout`, plus a
  self-review fix (`verify_password` could raise `UnicodeEncodeError` on a non-ASCII stored hash,
  contradicting its own "never raises" contract). Both approval constraints shipped **as tests**: a
  parametrized test holds nine data endpoints open without a cookie, and the two auth tables are
  asserted out of `TABLES`/`TABLE_INTRODUCED_AT` with the envelope unchanged at schema 6.
  `_default_profile_id` is untouched. Remaining chain: **#85** (Resend invite/reset, rate limiting,
  owner bootstrap) → **#86** (flip the gate, delete `_default_profile_id`, frontend login) →
  **#87** (export/import role behaviour), each `blocked` and each needing its own approval. Design
  of record: `docs/superpowers/specs/2026-09-04-accounts-auth-design.md`. Intake unchanged:
  #27/#30/#32/#33 have specs but no `ready` children; #70 unshaped.

  **Deployed the same session** (`3ed18a4`, 2026-09-05), jumping the Pi from `9e4bf65` and so also
  taking #93/#95/#96/#97/#98/#99/#100 live. Verified on the box: schema version 6, row counts
  unchanged against the pre-deploy snapshot (1/2/33/0/814/0), auth tables absent from the export
  envelope, `/api/auth/me` 401, login refused for the seeded NULL-hash profile, and the data
  endpoints still 200 — the gate is open, as #84 requires. Restore drill re-run per the
  post-schema-change rule and passing (`integrity_check` ok, `user_version` 5, counts matched).
  The arm64 image build that could not run before the merge ran here as `deploy.sh`'s first step,
  so the no-build-tools premise is confirmed end to end rather than only by wheel resolution.
  Recorded in `docs/CHANGELOG.md` and `AGENTS.md` Status (PR #104) — both were stale, Status by a
  week, still naming `17bd4fc` as running with #79-#82 unreleased.

  **The orchestration process changed this session** (PR #102, owner-reviewed). The plan gate now
  keys on **decomposition, not effort size** — an Issue whose spec already yields an ordered,
  testable sequence gets executed, whatever its effort label. Plans carry task ordering, the
  decisions the spec left open, test *names* and the easy-to-skip verifications — not test and
  implementation bodies; #84's plan was re-cut 1091 → 266 lines as the reference shape. Plans are
  now linked from their Issue (`**Plan:**` line in the body), because none were and the gate was
  reading a directory listing. `blocked-by` is documented as the `blocked` label the repo actually
  uses, since the native dependency field PLAYBOOK named does not exist on this API. And a soft
  effort split is on record: ~60% implementation, ~30% planning, ~10% review, review being regular
  rather than terminal. The rule change paid for itself immediately — #84 was planned and stopped
  under the old gate, then executed end-to-end under the new one in the same session.

  **The second Claude session in this repo is still worth watching.** It authored #93/#94/#95 on
  2026-09-04 without pushing an In-flight claim. The claim mechanism only works if every driver
  uses it.
- **Next action:** **#105 (login and set-password screens)** — the data model is now safe for
  multiple users (#110), so the thing the owner cares about next is logging in as different people
  and actually seeing the isolation. #105 is `blocked` and needs its own `/orchestrate approve` (it
  changes auth/session handling → destructive; the standing approval is granted per-step as each
  predecessor lands). Then **#86** (flip the gate, delete `_default_profile_id` — its call sites now
  all route through `acting_profile_id`, so this is a one-function change), then **#87**
  (export/import role behaviour).

  **Mail is unblocked and proven end to end.** The owner minted a Resend key, it is on the Pi's
  `.env` (mode 600), and the bootstrap invite was received. `MAIL_FROM` is
  `noreply@contact.kapekost.co.uk`. Waiting on the owner: approve **#105** when they want login
  built, and a quick in-app check that their own history is all still there after #110 (the one live
  regression risk — scoping should return the owner all their own rows, since the seed profile is
  today's acting profile).

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- **The accounts chain needs approval per step; #84 and #85 have it, #105/#86/#87 do not.** All of
  them change auth, session, token or password handling, which GUARDRAILS classifies as
  **destructive**, requiring the `approved` label. No tick may add that label itself — see GUARDRAILS
  "Approval is human-only." **#84 approved 2026-09-05** (shipped and deployed). **#85 approved
  2026-09-05** (`/orchestrate approve 85`; rationale and the constraints execution must respect are
  commented on the Issue). Approve **#105**, then **#86**, then **#87** as each predecessor merges —
  each step's scope is only settled once the one before it lands.
- **Two `[template]` improvements are queued and cannot be filed unattended (2026-09-05).**
  Both want the same destination: `agent-scaffold` PR #2, which is already open. (1) PLAYBOOK says
  nothing about recovering from a subagent that dies mid-task — it should require the controller to
  inspect the dead agent's worktree for uncommitted work before re-dispatching, and to read a live
  claim from a dead agent of its own session as still held rather than as a competing driver's.
  (2) The `/orchestrate approve` variant never says which branch its record goes on, and the
  2026-09-04 "home branch never merges" decision made that ambiguity load-bearing: the #84 approval
  was committed to `STATE.md` on `main`, whose copy predated the #88/#93 entries, leaving two
  divergent state files that this tick had to reconcile by hand before it could claim anything.
  Filing either means a PR against `agent-scaffold`, which GUARDRAILS "Cross-repo writes" allows
  only through a named credential or a direct owner ask — the same bar that gated the two entries
  already in PR #2. Say the word and both go on that PR.
- **`agent-scaffold` PR #2 is open and needs a review** — the two `[template]` entries, filed
  2026-09-04 once the owner asked for them directly. That direct ask is what unblocked them:
  GUARDRAILS "Cross-repo writes" bars a tick from using this repo's ambient `gh` auth to write to
  another repo on its own initiative, and a human asking for the PR is exactly the authorisation
  that rule is protecting. No CI is configured on that repo; all four `tests/*.sh` were run locally
  and pass. Superseded context, kept because it explains the rule: GUARDRAILS "Cross-repo writes" allows a template-repo PR only through a named,
  explicit credential set up for that purpose, "never implied by this repo's own `gh` auth" — and
  the only auth on this Mac is the owner's personal `gh` token. So the 2026-09-02 entry (intake
  splits can create children with no state label; `gh issue create` bypasses the ISSUE_TEMPLATE
  default, which is how #68 sat invisible to both tracks for 3 days) and the 2026-09-04 entry
  (GitHub's auto-delete-on-merge eats the orchestration home branch, taking the claim mechanism
  with it) are both still unfiled against `agent-scaffold`. The owner either sets up that
  credential or applies them by hand — `~/dev/agent-scaffold` is checked out locally. Not something
  a tick may work around by using the ambient token.
- **`[unsure]` IMPROVEMENTS.md entry (2026-08-30):** the `code-review` skill's forked execution
  silently reviewed the wrong attached repo (kapekost-web instead of workout-tracker) when
  invoked with no explicit target during the #38 tick. Not fixable via a PR in this repo or the
  template repo — looks like Claude Code harness/skill-runtime behavior. Flagging per PLAYBOOK
  step 8 rather than guessing at a fix.
- **`[unsure]` IMPROVEMENTS.md entry (2026-08-31):** the Agent tool, dispatched without
  `isolation:'worktree'` for #66's execution, shared the parent session's own working
  directory/git checkout by default — its `git checkout -b ...` silently switched the
  orchestrator's own checked-out branch mid-session. Caught via a stale-file system-reminder, not
  a loud failure. Not fixable via a PR in this repo — Agent-tool/harness default behavior. Real
  fix candidate for `PLAYBOOK.md`'s Execute step: default to `isolation:'worktree'` for any
  subagent dispatch that does its own git branch/commit work.

### Resolved 2026-09-04 — the home branch never merges
- ~~**Home branch survives only by hand**~~ — **decided.** Enabling auto-delete-on-merge deletes
  `claude/workout-tracker-backlog-bu9qnw` whenever its PR lands on `main`, even when merged
  deliberately without `--delete-branch`; PR #90 did exactly that. That branch *is* the claim
  mechanism, so losing it silently disables collision protection for every later tick. The owner
  chose to **stop merging it at all**: orchestration doc commits go straight to the branch, and
  when `main` should carry them they get cherry-picked onto a short-lived branch and PR'd from
  there. The branch never merges, so auto-delete can never reach it, and nothing depends on
  remembering to re-push. Fed upstream as `agent-scaffold` PR #2.

### Closed 2026-09-04
- ~~**Google OAuth app publish status — off-site backups down**~~ — **resolved, verified**. The
  owner published the app and re-authorized rclone during this session. Confirmed from the Pi at
  21:24 BST: `rclone lsd gdrive:` succeeds, and `workout-20260904-212433.db` (172032 bytes) is in
  `gdrive:workout-tracker-backups`. The run that produced it also exercised the new #88 success
  path end to end — `data/backup-status.json` reads
  `{"status":"ok","at":"2026-09-04T20:24:46Z","bytes":172032,"duration_s":13}` and `/api/health`
  reports `ok`. Last good copy before this was 2026-08-31, so the gap was 2026-09-01..04. Keep the
  cause written down: an OAuth app left in "Testing" publish status expires refresh grants every 7
  days, and the client_id migration was exactly 7 days before the first failure.

- ~~**Orphaned branches, manual cleanup scheduled**~~ — **done**. 28 dead remote branches deleted.
  The runner's long-standing 403 on `git push --delete` turned out to be specific to the GitHub
  App's permission set: the same command runs fine from the owner's Mac with the owner's own
  credentials. Worth remembering as the workaround rather than re-filing this each tick.
- ~~**Branch auto-delete-on-merge is silently broken**~~ — **resolved**. Verified via
  `gh api repos/kapekost/workout-tracker --jq .delete_branch_on_merge` → `true`. The setting is
  on, so merged branches clean themselves up and the pile stops growing.
- ~~**`STATE.md` on `main` is stale and conflicts with this branch**~~ — **resolved this tick**.
  The conflict was real but turned out to be strictly additive: `main`'s side was empty in the
  conflicting region, so this branch already contained every entry `main` had plus the newer ones.
  Verified entry-by-entry that nothing on `main` was dropped before committing the resolution.
  `IMPROVEMENTS.md` conflicted the same way and was resolved by keeping all four entries in date
  order.

## Tick log
- **2026-09-05 (#110 → PR #112, shipped + deployed):** Per-profile data isolation. Reconciled first:
  `main`'s `STATE.md` was stale (still named #84 as next), so the live cursor was read from this home
  branch per "Claiming work" — #110 was the sole `ready` issue and the recorded next action. Not
  destructive (no schema/auth/session/token change, reversible), so no approval; passed the
  decomposition gate (issue body is the spec) → executed, not planned. Claim pushed to this branch
  before any work (`a22c507..b45cbd1`).

  **Implementer subagent (sonnet, worktree) was cut off mid-task by the account usage limit** ("resets
  2:30pm BST") while still exploring — but it had already written a complete, high-quality
  table-driven leak test (161 lines: an `acting_as` monkeypatch fixture, sets read via
  `GET /api/sessions/{id}`, `POST /sets`→404, the "ask for B's exercise while acting as A → empty"
  scoping proof, fresh-profile-empty, B-unchanged). Inspected the dead worktree per the recovery
  discipline (the queued `[template]` improvement), salvaged the test to a commit rather than losing
  it. Owner chose to continue **inline** rather than wait for the reset; re-dispatching a subagent
  would just re-trip the limit. TDD red confirmed with the seam-only ("GET /api/sessions: leaked B's
  data"), then implemented: one `acting_profile_id(conn)` seam (returns `_default_profile_id` today),
  every in-scope read scoped and every mutation ownership-checked (404, not 403), `/api/export` and
  `/api/import` left for #87. One expected regression: `test_delete_nonexistent_personal_best_*` now
  asserts 404 — the isolation model makes "gone" and "not yours" indistinguishable; renamed and
  re-justified. Backend **183 green** (was 182; +1 leak test), #84 open-gate test green. Reviewed as
  a full diff **inline by the controller** (a forced deviation — the usage limit was tripping reviewer
  subagents), with CI and the live check as the additional gates.

  Squash-merged to `main` (`240acc4`) on green CI (test/Backend tests/sanity). **Deployed to the Pi**
  (owner ran `deploy.sh` after a PATH-only hiccup): arm64 `240acc4` built, shipped to
  `kapekost@192.168.1.170`, container recreated, `/api/health` `version=240acc4`, backups ok. Dead
  worktree + merged branch cleaned up. **Live two-user isolation is not clickable until #105/#86 add
  login** — today `acting_profile_id` returns the seed for every request, so the API always acts as
  one profile; the isolation is proven by the leak test on the deployed commit, and the live
  regression risk (scoping hiding the owner's own data) is an in-app check left with the owner.
  Rulings: /api/profile/me routed through the seam though the spec didn't name it (consistency; #86
  otherwise has to change it separately); inline execution + inline review under the usage limit.
- **2026-09-05 (live session — mail works end to end, secrets audited):** The owner minted a Resend
  key and passed it without it entering the transcript (clipboard to a local file, copied to the
  Pi's `.env`, temp file deleted).

  **Two sender-domain findings, both the opposite of what was assumed.** The apex
  `kapekost.co.uk` is **not** verified on this Resend account — sending from it returns a 403. That
  had been assumed verified because `kapekost-web`'s code sends from `hello@kapekost.co.uk`. What
  *is* verified is the **`contact.kapekost.co.uk` subdomain**, confirmed by probing the send
  directly rather than by minting another token. `MAIL_FROM` is now
  `noreply@contact.kapekost.co.uk`, which also lifts the restriction that briefly applied while
  using Resend's `onboarding@resend.dev` fallback — that works with no verified domain but delivers
  only to the account owner, so it could never have invited anyone else.

  **The owner received the invite email.** The full chain — key, token, Resend, link — is proven on
  real infrastructure, which is what the spec wanted before anyone else is invited. Setting the
  password still needs a `curl` until #105 ships the screen. Several orphaned invite tokens exist
  from the failed sends; harmless, since their raw values never left the process, and they expire in
  7 days.

  **Secrets audited across all 364 commits** — Resend, Google OAuth, SSH, Tailscale, AWS, GitHub and
  Slack shapes. Clean, nothing to rotate. The CI guard meant to prevent exactly this only checked
  `.mcp.json` for three patterns, so it now scans every tracked file and hard-bans committed env
  files, verified against planted secrets rather than only seen to pass (PR #111).

- **2026-09-05 (live session — #85 deployed, secrets moved out of Markdown, mail blocked):**

  **Secrets left `AGENTS.local.md`.** The owner's call: "we probably dont add keys in md files."
  They now live in a `.env` beside `docker-compose.yml` on the target, loaded automatically by
  Compose for `${...}` substitution — deliberately *not* `env_file:`, which requires the file to
  exist and would turn a forgotten `.env` on a rebuilt host into a failed deploy. Every value has a
  default, so a missing `.env` means mail stops sending, not a broken deploy. `.env.example` tracked;
  `AGENTS.local.md` now records only where keys live and where they come from. PR #108.

  **#85 deployed** (`6da2e22`, then `c9442d8`), and the first real invite send **failed twice, both
  times usefully.** First: HTTP 403, Cloudflare error 1010 — Cloudflare fronts `api.resend.com` and
  blocks urllib's default `Python-urllib/3.x` agent, which presents exactly like a rejected API key
  and sent the first diagnosis down the wrong path. Fixed with a real User-Agent, plus wrapping
  `HTTPError` so failures carry the response body; a failure that will not say why is barely better
  than a silent one (PR #109). Second, with the reason now visible: **401, "API key is invalid"** —
  the key copied from `kapekost-web` is `re_placeholder`, 14 characters. That repo never had a live
  key; it exists only in Vercel. Verified the transfer itself was faithful (identical SHA-256 either
  side) before blaming the key.

  Neither failure was reachable by the test suite, which fakes Resend at the boundary and would have
  gone on passing forever. This is precisely the argument the spec made for the bootstrap being a
  real send before anyone else is invited.

  **#110 opened** after the owner asked to exercise multi-user UX before login. Reads have never been
  scoped to a profile — deliberate in #66, invisible with one profile, a data leak with two. Scoping
  is separable from authentication and ships while the app is open; a profile *switcher* was
  deliberately not opened as an issue, since switching without a login is a backdoor that #86 would
  have to delete.

- **2026-09-05 (live session — approvals restructured, #85 shipped):** The owner asked to stop
  approving step by step ("i have not got much context per number to review or know") and for tick
  summaries written for a product owner rather than an engineer. Both are now policy (PR #106).

  **The approval change is a narrowing, not a weakening.** The destructive trigger "changes auth,
  session, secret, or token handling" fires on every step of an auth feature by definition, which is
  why one workstream produced five approval requests against a design already approved in full. An
  owner-approved spec now carries its approval to the children it decomposes into, recorded in
  `DECISIONS.md` naming the spec and the exact issues. **"Approval is human-only" is untouched** — no
  agent may grant a label; what changed is how much needs one. A new hard-gated list keeps the truly
  irreversible out of it, including a new entry: making a private deployment publicly reachable,
  which is the real irreversible step in #27 and should never have ridden along on a workstream
  approval.

  **#85 shipped** (PR #107, `1cfcc6b`): token minting, the Resend seam, set-password,
  forgot-password, admin invites, rate limiting and the owner bootstrap. 28 new tests, 180 backend
  green. Two design points beyond the spec's letter: identical response bodies were not enough for
  enumeration, since a send that happens only for real addresses can be *timed*, so forgot-password
  sends after the response via `BackgroundTasks`; and the rate limiter runs **before** any hashing,
  because rejecting afterwards would leave the 627 ms CPU amplifier fully intact.

  **Self-review caught two bugs CI could never have caught.** The bootstrap script's own instructions
  told the operator to run it inside the container, but the Dockerfile copied only `backend/main.py`;
  adding the `COPY` still failed because `.dockerignore` excluded `scripts/` wholesale. Both surfaced
  only by running `docker buildx build --platform linux/arm64` by hand — the blind spot
  `Dockerfile:25-28` exists to warn about. That same build finally proved #84's bcrypt dependency
  installs from an aarch64 wheel with no compilation, end to end.

- **2026-09-05 (live session — process retuned, then #84 shipped end to end):** Two ticks and an
  owner review, in one session.

  **The owner reviewed how the runner decides when to implement**, prompted by the first tick
  planning #84 instead of building it. Four changes, PR #102: the plan gate keys on decomposition
  rather than effort size; plans carry decisions and test names rather than test and implementation
  bodies (#84's was re-cut 1091 → 266 lines); plans are linked from their Issue; and `blocked-by` is
  documented as the label the repo actually uses, since the native GraphQL field PLAYBOOK mandated
  returns `undefinedField`. A soft 60/30/10 implementation/planning/review split is on record, with
  review as a gate rather than a budget line. Recorded in `DECISIONS.md`.

  **#84 then shipped under the new gate** — PR #103, `3ed18a4`. Six TDD commits, 51 new backend
  tests, 152 backend and 216 frontend passing, CI green. Self-review before the PR caught one real
  defect: `verify_password` promised "never raises" but only caught `ValueError`, so a stored hash
  that was not even ASCII would have escaped as a 500 on the login path.

  **One verification did not run, and is recorded rather than glossed:** the by-hand
  `docker buildx build --platform linux/arm64`, because the Docker daemon was down. The risk it
  guards was checked more broadly instead — `pip download --only-binary=:all: --platform
  manylinux_2_17_aarch64 --python-version 3.14` resolved the entire runtime dependency set with no
  source distribution anywhere, `bcrypt-5.0.0-cp39-abi3-manylinux2014_aarch64` included, which is
  precisely what `Dockerfile:25-28` exists to protect. `scripts/deploy.sh` builds the image anyway,
  so the gate binds at deploy, not at merge.

- **2026-09-05 (live session — #84 planned, state reconciled):** Picked #84, the first pickable
  Issue since the owner approved it. It is `effort:M` with no linked plan, so PLAYBOOK step 3
  planned it and stopped rather than executing.

  **Plan shipped:** `docs/superpowers/plans/2026-09-05-accounts-auth-core.md`, PR #101, green on
  all three checks, squash-merged as `cd2e951`. Six TDD tasks with the actual test and
  implementation code in each, not prose: schema v6 migration → bcrypt cost-12 helpers → session
  store and `wt_session` cookie → `current_profile` + `GET /api/auth/me` → `POST /api/auth/login` →
  `POST /api/auth/logout`.

  **Both constraints from the approval comment are carried as tests, not prose.** The gate stays
  off the data endpoints, guarded by a table-driven test asserting `/api/sessions`, `/api/notes`,
  `/api/export`, `/api/profile/me` and the rest still answer 200 without a cookie — so flipping the
  gate early fails the suite instead of shipping. And `auth_tokens`/`auth_sessions` stay out of
  `TABLES`/`TABLE_INTRODUCED_AT`, asserted directly plus a check that the export envelope's table
  set is unchanged at schema 6.

  **One addition beyond the Issue's literal wording, flagged in the plan for a reviewer to drop:** a
  `_dummy_hash()` on the login path, so an unknown username pays the same bcrypt cost as a real
  account. Without it the two are trivially distinguishable by response time. The spec takes exactly
  that position for `/api/auth/forgot-password`; the plan applies it to the endpoint #84 ships.

  **Found and reconciled: state was split across two branches.** The owner's approval commit
  (`366e9f3`) went to `STATE.md` on `main`, but `main`'s copy predated the #88/#93 tick entries that
  live only on this branch — so each side held facts the other lacked, and neither was a superset.
  This file now carries both; `main`'s stays behind by design, since the home branch never merges
  (2026-09-04 decision). Logged as a `[template]` improvement: the approve variant never says which
  branch its record goes on, which is exactly the ambiguity that decision made load-bearing.

  **Verified before merging rather than assumed:** `bcrypt` 5.0.0 publishes
  `manylinux_2_17_aarch64` wheels for cp314, checked against PyPI, so the Dockerfile's no-build-tools
  premise should survive the new dependency. The plan still makes a by-hand
  `docker buildx build --platform linux/arm64` non-optional, because CI never builds that Dockerfile
  and a wheel that is missing at build time would be invisible to every green check.

- **2026-09-05 (#93 shipped — the backup's two legs report independently; a dead subagent
  recovered):** The tick opened on a live `#93` claim timestamped five minutes earlier, which
  PLAYBOOK's "Claiming work" would normally read as another driver and back off from. It wasn't:
  a task notification arrived naming the claiming subagent, and its session id was this session's
  own — the `/clear` between them is what made the claim look foreign. The agent had died on the
  account's five-hour session limit (429, resetting 01:30 BST) immediately after writing 11 RED
  tests, which existed only as uncommitted changes in its isolation worktree. Re-dispatching would
  have hit the same limit and thrown the tests away, so the tick finished the work in the main
  thread, whose requests were still being served.

  The tests were a good contract and were kept as written. `/api/health` now returns four backup
  keys instead of two, splitting a single `_last_backup()` into a per-leg `_leg()` helper: the
  local leg keeps the unprefixed `last_backup_status`/`last_backup_at` (it is the copy standing
  between us and data loss, and `scripts/deploy.sh` reads it), and the off-site leg reports
  alongside it. `scripts/backup.sh` splits its one all-or-nothing chain into two independently
  recorded legs **without reordering it** — `rclone` still runs last, after the snapshot is on the
  host's disk, which is exactly why the local copies survived 2026-09-01..04. Local success is
  exit 0; a local failure exits non-zero and records the off-site leg as `skipped`, keeping "never
  tried" distinct from "tried and broke". Neither ages into `stale`, since only an `ok` does.

  Two details worth keeping. **A pre-split status file still reads correctly**: the Pi is carrying
  one and will until `backup.sh` next runs there, so `/api/health` reads a legacy single-status
  file as a local-only result and reports the off-site leg as `null` — unknown, not failed — with
  a test pinning it. Its top-level `remote` key is the remote's *name*, not a leg. And an
  incidental bug went with it: the old success branch pinged `HEARTBEAT_URL` as a success even
  when `write_status` had failed and set `status=1`; the ping now follows the final exit status.

  101 backend tests pass (from 11 failed / 90 passed), all three CI checks green on the verified
  head commit, merged `69baa6c`. Feedback review ran: the `[local]` entry — `AGENTS.md` telling
  you to build the venv with `python3`, which is 3.9.6 on stock macOS and cannot install the
  pinned 3.14 requirements, costing a wasted venv build this very tick — shipped as PR #100
  (`61f3c91`). The `[template]` entry is queued under "Needs owner". Cursor advanced to 10.

- **2026-09-04 (#88 shipped end to end — backup heartbeat, weekly cron, deployed):** Picked #88,
  the only unblocked meaningful `ready` work; #84 carries `ready` but is not pickable without human
  approval, and #89 is waiting on a URL only the owner can make. Claim pushed before any execution
  and accepted as a fast-forward, so no competing tick was live.

  **The design changed on contact with the real hardware.** The issue says "the script writes
  `data/backup-status.json`", which reads as a plain shell redirect. It isn't possible:
  `~/workout-tracker/data` on the Pi is `drwxr-xr-x root root`, created by Docker when it first
  mounted the volume, and the cron user has no passwordless sudo — the same constraint that put
  rclone in `~/.local/bin` as a static binary. Checked before writing any code rather than after
  discovering it in a cron failure at 03:30. The script now stages the JSON in a host temp file it
  owns and lets `docker cp` place it: that runs as the Docker daemon, writes through the bind
  mount, and the file lands owned by the host user. `docker cp` also works against a *stopped*
  container, so "the backup failed because the app was down" — the one case the old HTTP heartbeat
  structurally could not report, since it POSTed to the app itself — now gets recorded.

  **Caught in review, not by CI.** Reading the status from a file removed the `with db() as conn`
  that the old handler used for its query, and with it an incidental liveness check: `/api/health`
  would have returned 200 for an app whose database was unopenable, while `scripts/deploy.sh` has
  always read anything other than a 200 as "the deploy is not up". The endpoint now touches the DB
  deliberately, with a test that was confirmed to fail without the fix rather than assumed to.
  Also folded the duplicated status-file test helper into `conftest.py`, which exists for exactly
  that reason. Backend tests 88 → 92.

  **Deployed, then flipped the cron, in that order.** Owner decision at the boundary (see
  `DECISIONS.md`). `9e4bf65` is live and verified on the Pi — the first deploy since `17bd4fc`, so
  the py3.11 → 3.14 base image and pydantic 2.13.5 are now actually running, not just
  hand-verified. Then `crontab` went `30 3 * * *` → `30 3 * * 0`, with the old crontab saved on the
  Pi at `~/crontab.backup-2026-09-04`. Flipping the cron first would have left `/api/health`
  permanently stale, which is the precise failure the issue exists to prevent.

  **Proved end to end on the Pi, not just in tests.** A manual `backup.sh` run wrote
  `{"status":"failed","at":"2026-09-04T20:17:42Z",...}` through `docker cp`, `/api/health` read it
  back, and the local snapshot `workout-20260904-211731.db` still landed despite the Drive leg
  failing. That last part is the chain ordering earning its keep in production rather than in a
  comment. The `"failed"` is honest: Google Drive is still `invalid_grant`, unchanged from the
  start of this tick. It did not stay that way: the owner published the OAuth app and re-authorized
  rclone while this tick was finishing, and a run at 21:24 BST put `workout-20260904-212433.db` in
  Drive and flipped `/api/health` to `ok`. So the new mechanism has now been proven on both paths on
  real hardware, failure first and success second, which is better coverage than a working Drive
  would have given.

  **Feedback review (step 8) ran** because this tick logged three entries. Both `[local]` ones
  shipped as PR #92: step 4 no longer tells subagents to append to `IMPROVEMENTS.md` themselves
  (the log and its cursor live on the home branch, so a feature branch writing there leaves the
  note unmerged and conflicting), and it now says what a fresh worktree lacks, which is what made
  the subagent's verification commands fail for reasons unrelated to its change. The `[unsure]`
  PATH entry turned out to be smaller than it looked: `AGENTS.local.md` already has a
  "Local development tool paths" table for exactly this and was only missing a `gh` row, now added.
  The two older `[template]` entries could not be filed — see "Needs owner". Cursor advanced to 8.

  **Not merged to main on purpose.** This home branch stays unmerged so the repo's
  auto-delete-on-merge cannot eat it again the way it did this morning, taking the claim mechanism
  with it. That leaves `main`'s copy of these orchestration docs behind the live branch — a real
  tradeoff, and the underlying choice (keep merging and re-push every time, or stop merging and
  cherry-pick doc commits) is written up in `IMPROVEMENTS.md` and wants an owner call.
- **2026-09-04 (owner-driven session — accounts designed, backups found broken):** Not an
  unattended tick; the owner asked for a status pass and the next round of work.

  **Found broken, needs the owner:** off-site Google Drive backups have been failing since
  2026-09-02 (`invalid_grant`), last good copy 2026-08-31. Caught from `/api/health`'s
  `last_backup_status: "failed"` while checking what was actually deployed. Local snapshots are
  fine — `rclone copy` sits after the snapshot reaches the host's disk, so the chain kept
  producing them. Cause matches the "Testing publish status expires grants every 7 days" trap
  already written down in `AGENTS.local.md`; the client_id migration was exactly 7 days before the
  first failure. See "Needs owner".

  **Accounts designed.** #67 and #68 merged into one workstream and closed as superseded — the
  owner's 2026-09-02 emailed-link decision makes them mutually dependent, so neither can go first.
  Spec at `docs/superpowers/specs/2026-09-04-accounts-auth-design.md` (PR #83), split into #84-#87.
  Two choices were settled by measuring on the real Pi instead of assuming, both of which changed
  the answer: bcrypt cost 12 (627 ms) over any memory-hard KDF, because OWASP's scrypt baseline
  wants 128 MiB against ~185 MiB free and each concurrent memory-hard hash reserves its full
  working set — a few parallel logins to an unauthenticated endpoint could OOM the container on a
  box that also runs Home Assistant; and confirming both bcrypt and argon2-cffi ship aarch64
  wheels, so the Dockerfile's no-build-tools rule survives either way.

  **Two sequencing traps found while designing, both recorded in the issues rather than left to be
  rediscovered:** gating `/api/events` breaks the nightly backup heartbeat (it posts there from
  cron with no session and swallows failures via `|| true`), so #88 must land before or with #86;
  and taking the cron weekly makes `/api/health`'s 26h staleness check permanently `stale`, so the
  threshold has to move with the schedule — a signal that is always red is one nobody reads, which
  is how this week's failures went unnoticed for three nights.

  **Dependabot #80/#81 hand-verified and merged.** Both were green in CI, which proves little for
  #81: CI runs tests bare-metal and never builds the Dockerfile, the same blind spot that kept
  #7/#23 open for weeks. Verified by hand instead — full `docker buildx build --platform
  linux/arm64` (deps installed in 5.2s with no compilation, so the no-gcc premise still holds on
  py3.14), 88 backend tests on py3.14 + pydantic 2.13.5, container smoke test, fresh DB migrating
  to `user_version = 5`, image +4 MB. #81 left two things behind — CI still pinned to py3.11, and
  a Dockerfile comment still asserting the wheel fact for py3.11 — both fixed in #82, which also
  writes the "CI never builds this Dockerfile" warning into the comment so the next base-image
  bump doesn't trust a green check either.

  **Housekeeping:** 28 dead remote branches deleted, closing a "Needs owner" item that had been
  open since 2026-08-30. The runner's 403 on `git push --delete` is specific to the GitHub App's
  permissions — the same command works from the owner's Mac. `delete_branch_on_merge` also
  verified on, so the pile stops growing. `AGENTS.md`'s Status section refreshed: it claimed
  `5247896` was live and "nothing is unreleased", when `17bd4fc` is deployed and `main` is 4
  commits ahead including a base-image change.
- **2026-08-31 (deploy repair → #78):** `main` reached the Pi for the first time since
  2026-08-25. The running app was pinned at `5247896`, **53 commits behind**, because the deploy
  path was broken in two independent places — both shipped and closed without ever having been
  run against the real target.
  1. **`scripts/deploy.sh` could not start.** It parses `AGENTS.local.md` for a
     `## Scripted deploy configuration` section and hard-fails via `: "${DEPLOY_HOST:?...}"` if
     absent. That section existed only in `AGENTS.local.md.example`, never in the real file. So
     #34/#61 shipped a deploy script that had never once executed. Fixed locally (the real file
     is gitignored, and stays that way per GUARDRAILS "Deployment knowledge stays local"), with
     the parser's four failure modes documented inline next to the values: keep the keys at
     column 0 above the next `## `; `DEPLOY_APP_DIR` must be absolute because it lands inside
     single quotes in a remote `cd`; the SSH key path must be absolute because the value is
     word-split unquoted onto the `ssh` command line; and **never** `BatchMode=yes`, despite the
     `.example` suggesting it — the key is passphrase-protected and BatchMode blocks the macOS
     keychain, surfacing as a misleading `Permission denied (publickey)`.
  2. **`deploy.sh` skipped the target-side `git pull`** — fixed via PR #78. The Pi supplies its
     own `docker-compose.yml` from its own clone; that clone was also at `5247896`, so it still
     hardcoded `image: ...:latest` instead of `:${APP_COMMIT:-latest}`. `APP_COMMIT` was
     therefore ignored, the stale image would have been re-created, and the script's own
     `/api/health` assertion would then have failed with a version mismatch that reads like a
     build problem rather than a stale-checkout one. The manual runbook had always done this
     pull; the scripted path dropped it. `--ff-only` so a diverged target halts loudly instead of
     quietly merging on the Pi.

  **Deployed `17bd4fc`, verified independently of the script's own assertion:** `/api/health`
  reports `version=17bd4fc` with `last_backup_status=ok` (not stale), `/` returns 200, the
  container runs `kapekost/workout-tracker:17bd4fc` (not `:latest` — direct proof the pull fix
  worked), the Pi's clone advanced to `17bd4fc`, and `homeassistant` stayed `Up (healthy)`
  throughout, as did `tailscale`.

  **Migration v3→v5 landed clean.** Snapshot taken before touching anything (845 rows, schema
  v3) and diffed against a post-deploy export: `user_version = 5`, `integrity_check = ok`, no
  leftover `*_old` tables, identical row counts, and every pre-existing row byte-identical on all
  shared columns — the only change is the added `profile_id`, backfilled to the `kapekost` admin
  profile. Worth recording that the risk was lower than it looked: the v3→v4 rebuild
  (rename → create → copy → **drop**) only touches `exercise_notes` and `personal_bests`, and both
  were empty. The 845 rows that exist live in tables it does not rebuild.

  **Rollback was impossible when this tick started** and is now possible: the running image and
  its predecessor were both untagged dangling IDs, one prune away from gone. Tagged
  `:5247896` and `:adbf3f5` explicitly on the Pi after confirming each one's identity from its
  `APP_COMMIT` env stamp rather than trusting the ID in the notes. Recorded in `AGENTS.local.md`,
  along with the caveat that rolling back below `17bd4fc` needs a DB restore, not just a tag
  swap — a pre-v4 image sees `user_version = 5`, no-ops its own migration, and then fails every
  insert into the rebuilt tables because it never supplies the now-`NOT NULL` `profile_id`.

  **Not fixed, flagged deliberately:** under the image's Python 3.11 `sqlite3`, DDL runs in
  autocommit, so the v4 rebuild is not atomic end-to-end — a crash mid-rebuild leaves a
  half-migrated DB. It completed cleanly here and both affected tables were empty, so the
  exposure was nil this time; it will not be on the next schema-changing deploy onto a non-empty
  `exercise_notes`. Out of scope for this tick, not silently dropped.
- **2026-08-31 (#69 → #77):** Shipped. Picked up directly (effort:S, no separate plan needed per
  `PLAYBOOK.md`'s effort:M+ threshold) once #67 turned out to be blocked on owner approval. Scoped
  down from the issue's full text to just the TopBar-display piece — schema v5 (nullable
  `profiles.icon`, seeded 💪 for `kapekost` so the display isn't empty immediately), `GET
  /api/profile/me`, `TopBar.jsx` rendering it — deferring the emoji-picker-at-creation-time piece
  since profile creation doesn't exist until #67. `code-review` (explicit target again) found two
  more real bugs: the brand title and the new profile chip shared one flex row with no
  shrink/overflow handling, so a longer username than the seeded one (nothing bounds
  `profiles.username`'s length) wraps "🏋 Gym Tracker" onto two lines on narrow viewports —
  confirmed live in a real browser, fixed with `nowrap`/`flexShrink:0` on the title and ellipsis
  truncation on the username. Separately, the new migration-guard test
  (`test_icon_migration_does_not_override_an_already_set_icon`) could never actually fail: by the
  time it ran, `user_version` was already 5 from the fixture's own setup, so its second `init()`
  call never re-entered the `if v < 5` block the guard lives in at all — confirmed by removing the
  guard clause from `main.py` and watching the test stay green regardless. Fixed by resetting
  `user_version` to 4 first (matching this file's other migration-guard tests), then verified it
  now fails without the guard and passes with it restored, same rigor as #66's import-path catch.
  Backend 88/88, frontend 216/216, build green. **Process note, logged honestly rather than
  glossed over:** this tick's own In-flight claim was pushed late — after the PR was already open,
  not before starting work, contrary to `PLAYBOOK.md`'s own "Claiming work" section. No actual
  collision occurred (no concurrent tick was running), but this is exactly the discipline that
  section exists to enforce; noting it so it doesn't quietly become a habit. All 3 checks green,
  merged squash.
- **2026-08-31 (#66 → #76):** Shipped. Executed the merged plan
  (`docs/superpowers/plans/2026-08-31-profiles-schema-migration.md`) via a background subagent,
  dispatched with an explicit file list and told not to touch `docs/orchestration/*` — it followed
  the plan's actual migration code verbatim (verified by diffing the final `_migrate` block
  against the plan's literal SQL) across 7 commits, 83/83 tests passing, and reported 5 small,
  well-reasoned deviations up front rather than silently diverging: two of the plan's own new
  tests had a real setup bug (resetting `PRAGMA user_version` alone doesn't simulate "pre-v4 data"
  for the two *rebuilt* tables, since the test fixture's `init()` already migrates them first —
  fixed by actually recreating the old table shape); one task-sequencing gap the plan had already
  pre-empted for a different function but not this one (pulled the fix forward, same resolution);
  5 pre-existing hardcoded `user_version == 3` assertions across two other test files broke on the
  version bump and needed updating to 4 (expected migration hygiene, not a bug); and one
  documentation-location assumption in the plan didn't match reality (schema history actually
  lives in `docs/CHANGELOG.md`, not `AGENTS.md`), resolved by using the closest existing analog
  since the task's own file target was unambiguous. None of this touched the migration design
  itself.

  **`code-review`, run with an explicit target (path + diff range) per this session's own logged
  harness gotcha, caught a real, severe bug the 83 passing tests never exercised:** once
  `profiles` joined `TABLES`, `/api/import` restoring *any* pre-v4 backup would permanently wipe
  the seed profile with no `"profiles"` key in the old envelope to restore it from — every write
  endpoint's `_default_profile_id()` then crashes with no way to self-heal (schema's already at
  v4, so the reseed guard in `_migrate` never re-runs, not even across a restart). A second,
  related bug: a real pre-v4 backup containing actual `exercise_notes`/`personal_bests` data (both
  pre-existing, already-shipped features — a plausible, not edge-case, scenario) would reject the
  *entire* import with a 400, since those two rebuilt tables now require `profile_id NOT NULL` and
  legacy rows don't have one. Both were exactly the restore-drill scenario `AGENTS.md`'s deploy
  runbook — and this migration's own plan — exist to catch, and the plan's own Task 6 reasoning
  ("NULL is exempt from FK enforcement... a one-time, expected consequence") was correct for
  `sessions`/`sets`/`events` but didn't extend to the two rebuilt tables or to `profiles` itself.
  Fixed directly (not deferred) before opening the PR: skip touching `profiles` on import when the
  envelope has no opinion about it, and backfill `profile_id` from the live default profile for
  any row landing in a `NOT NULL` `profile_id` column that doesn't supply one — same backfill
  philosophy the migration itself already uses. Two new regression tests confirmed failing with
  the exact reported symptoms (400; a broken write afterward) when reverted against the pre-fix
  code, passing with it restored. One minor `code-review` finding (`_default_profile_id`
  re-queries every write instead of caching) consciously left as-is — explicitly temporary code
  slated for removal in #67, not worth hardening further. Full suite re-verified green (85/85)
  after the fix. Posted the plan's own scripted hand-off comment on #67 (seeded profile's
  `password_hash IS NULL` by design; replace `_default_profile_id()` call sites, don't add a
  second mechanism) — corrected one wording slip in it immediately after posting. #67 and #69
  (both depended only on #66) labeled `ready`. All 3 checks green, merged squash.
- **2026-08-31 (#27 spec → #75):** Shipped, docs-only, given the extra care DECISIONS.md asked
  for rather than folded in alongside the other three specs this session.
  `docs/superpowers/specs/2026-08-31-public-access-design.md`: resolves the owner's actual
  2026-08-30 direction (keep the Pi, Cloudflare Tunnel not a VPN, Home Assistant safety is a hard
  requirement, sequenced behind real login), then designs the part actually left open — a tunnel
  alone only solves reachability/TLS, not access control, so proposed a second edge-level auth
  layer (Cloudflare Access, email allow-list) in front of the app's own login rather than treating
  the tunnel as sufficient on its own. Scoped the tunnel to exactly one ingress rule (this app's
  Compose service, over the internal Docker network) with Home Assistant explicitly never added to
  it. Rather than just asserting the design is safe, wrote a concrete, checkable verification list
  (confirm Home Assistant is actually unreachable through the new public hostname, confirm the
  ingress config has no catch-all rule, confirm no new router port-forward appeared, etc.) for
  whoever executes this to actually run through before it goes live — matching DECISIONS.md's
  explicit ask for a real home-network review, not just an app-level one. No real hostnames/tunnel
  IDs/account details anywhere in the doc — those stay in `AGENTS.local.md` per the existing
  convention; `docker-compose.yml`'s own already-tracked port numbers were fine to reference
  directly. Two things flagged explicitly as this spec's proposals, not owner decisions: the
  Access auth-method choice (§4) and the verification checklist itself (§5) — both need an actual
  skim, more so than a typical spec, per the PR body. Stays `intake`. All four intake issues
  (#27/#30/#32/#33) now have written specs. All 3 checks green, merged squash.
- **2026-08-31 (#33 spec → #74):** Shipped, docs-only, written in parallel with #66's execution
  (separate `git worktree` checkout — see the Agent-tool `IMPROVEMENTS.md` entry above for why
  that was necessary this tick). `docs/superpowers/specs/2026-08-31-nutrition-guidance-design.md`:
  resolves the owner's actual 2026-08-30 answers (bodyweight + height, standalone, ISSN-sourced,
  not personalized dosing), then does the spec-writer job — data model (two nullable columns
  direct on `profiles`, no history table), endpoint contracts, and the actual guidance copy written
  out close to verbatim (protein range formula, timing guidance, the always-visible disclaimer) so
  a future plan doesn't have to re-derive it. One thing surfaced rather than silently assumed: the
  ISSN protein guidance itself only needs bodyweight (it's g/kg) — height was the owner's own
  addition beyond that minimum, so the spec proposes a concrete, honest use (a contextual BMI
  figure, explicitly labeled a reference number, not a health assessment) and flags it as this
  spec's proposal, not a recorded decision, so it's easy to correct. Also narrower in sequencing
  than #30/#32: depends on #66 only, not #67 — bodyweight/height are meaningful even before real
  login exists, unlike per-profile import/coaching. Stays `intake` — next action is splitting into
  `ready` per the spec's §8. All 3 checks green, merged squash.
- **2026-08-31 (#30/#32 spec → #73):** Shipped, docs-only. Combined design for both issues in one
  pass, per the third Feature Intake outcome PR #71 named and IMPROVEMENTS.md's friction log —
  #30 and #32 independently converged on the same "structured AI output, reviewed and confirmed,
  then written to real data" shape, so one spec covers both rather than duplicating the
  review-before-write design twice. `docs/superpowers/specs/2026-08-31-ai-structured-io-design.md`:
  resolves every fork-in-the-road question either issue posed to the owner (all already answered
  in `DECISIONS.md` 2026-08-30 — nothing guessed here), then does the actual spec-writer job of
  designing the shared mechanism and concrete schemas — a new additive `/api/import/sessions`
  endpoint (separate from the existing disaster-recovery `/api/import`, matching its own
  `confirm`/envelope convention rather than inventing a parallel one), upsert-by-id semantics,
  lb→kg conversion offloaded to the AI's prompt instructions instead of app code, a new
  `exercise_targets` table for #32's proposed updates, and the recovery-science §7 constraint
  enforced structurally (no field in the response schema shaped like a percentage/readiness score)
  rather than only requested in the prompt. Both issues stay `intake` — this is a spec, not a
  split; splitting into `ready` children per the spec's §7 is the next action on these two, not
  done in this tick. All 3 checks green, merged squash.
- **2026-08-31 (#66 plan → #72):** Shipped, docs-only. `#66` is `effort:M` with no linked plan, so
  per `PLAYBOOK.md` step 3 this tick wrote the plan and stopped rather than executing directly.
  `docs/superpowers/plans/2026-08-31-profiles-schema-migration.md`: read the live schema
  (`backend/main.py`) rather than assuming it, which surfaced two real correctness traps the issue
  itself didn't call out — `exercise_notes` and `personal_bests` each carry a uniqueness constraint
  (`PRIMARY KEY`, `UNIQUE`) that must *expand* to include `profile_id`, which SQLite can't do via a
  plain `ALTER ADD COLUMN` (needs a rename/create/copy/drop rebuild); and `/api/import`'s existing
  per-table delete-then-insert-immediately loop requires `profiles` to be **first** in `TABLES`
  with `ON DELETE CASCADE` on every new FK, or a restore violates the FK either on delete (children
  still reference the parent) or on insert (parent doesn't exist yet). Also resolved the issue's
  own open question ("confirm the exact table list against the live schema") — `personal_bests`
  gets `profile_id` too, alongside the four tables the issue named. Plan hands off one item to
  #67 via a comment (Task 7): the seeded profile's `password_hash` is left `NULL` by design, so
  #67's login flow must handle a profile with no password set yet, not assume every profile has
  one. #66 stays `ready` — now unblocked for real execution next tick, not just plan-then-stop.
  All 3 checks green, merged squash.
- **2026-08-31 (status + tick resume):** `/orchestrate status` reconciled cleanly against live
  GitHub — zero drift from this file, nothing to correct (no open PRs beyond what's logged here,
  #66 confirmed the sole `ready` issue, #67/#68/#69 correctly withheld from `ready`, no new owner
  comments on any `intake`/`needs-clarification` issue since 2026-08-30). Confirmed both
  owner-pending items are genuinely still pending rather than assumed: the 13-branch cleanup
  command hasn't been run (all still present, unchanged SHAs), and the auto-delete-on-merge repo
  setting is still off (direct evidence: #71's own head branch survived its merge) — see "Needs
  owner" above for the now-updated tally.
- **2026-08-30 (PLAYBOOK.md fix → #71):** Shipped. Logged the "shaped but needs a spec" Feature
  Intake gap (hit on #27/#30/#32/#33 this session) via `scripts/append_improvement.sh`, then acted
  on it immediately rather than leaving it for a future review pass — small, well-understood,
  docs-only. `PLAYBOOK.md` step 3 now names this as a third Feature Intake outcome alongside
  relabel-`ready` and split-into-children. All 3 checks green, merged squash. Improvements cursor
  advanced to 2.
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
