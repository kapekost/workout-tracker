# Orchestration State

> Single-owner cursor for `/orchestrate`. Only the orchestration home branch may edit the sections
> below; a feature branch must never touch this file. **Hard budget: ~250 lines.** Every tick reads
> this file first, so its cost is per-tick and compounding — that is what keeping it bounded is for.
>
> **This file keeps no Tick log.** Each tick's write-back goes straight to `HISTORY.md` — prepended
> at the top, verbatim, per PLAYBOOK step 7 — and Cursor's "Current focus" carries the live summary
> instead. Resolved Needs-owner items move to `HISTORY.md` the same way. This file reached 1067
> lines on 2026-09-06 (~200 lines/day of tick-log growth) before the split; keeping no tick log here
> at all, rather than "the last N," is what stops it recurring.

## Cursor
- **Project:** Workout Tracker
- **Current focus:** **#86 shipped — the gate is closed** (`2bd2885`, PR #136, 2026-09-06).
  Accounts is **4 of 5 done**. No session, no app: all 21 data endpoints require one,
  `_default_profile_id` is deleted, `/api/health` is trimmed to `{status, version}` with the backup
  posture behind admin auth, `/api/events` is gated, and the frontend swaps route tables rather than
  guarding routes one by one. A meta-test enumerates the app's own routes, so a route added later
  without a gate fails the suite instead of shipping open. 225 backend + 303 frontend green.
  Executed under the standing approval; no `approved` label added or needed.
  **Merged, not deployed.** The deploy is the half that can lock the owner out — ask first.
- **Next action:** **#87** (export/import role behaviour) → **#124** (logout locks the device) →
  UI waves **#129/#130/#131**, in the owner's 2026-09-06 order. Unsequenced and pickable on their
  own merits: **#126** (P0 — a bare `docker compose up` downgrades production to `:latest`),
  #125, #127, #138. Queued behind accounts by owner call: **#132** (history scrub, `approved`
  label on, mirror backup mandatory), **#134** (docs trim — *another session is mid-flight on
  this*), **#137** (model tiering), **#135** (security review, blocked on #87).

## Stop-condition
(none — runner proceeds normally)

## In-flight
(no branches in flight)

## Needs owner
- ~~**Confirm the owner's history survived #110's read-scoping**~~ — **verified by the owner
  2026-09-06** ("yes i see it"). This was the one regression from #110 that no test could settle:
  the leak test proves a second profile cannot see the first's rows, but only a human could confirm
  the seed profile still returns *all* of its own. Closed.
- **#30/#32 need a 5-minute spec skim, not a decision.**
  `docs/superpowers/specs/2026-08-31-ai-structured-io-design.md` (refreshed and current as of #114)
  gates itself on an owner skim before either Issue may be split into `ready` children. Every
  fork-in-the-road question in it was already answered by owner Q&A on 2026-08-30 — the skim is
  confirming the spec-writer's mechanism design, not re-deciding anything. Until it happens, #30 and
  #32 stay `intake` and cannot become executable work.
- **A third `[template]` improvement is queued (2026-09-05), same destination as the two below.**
  PLAYBOOK step 1 named the three orchestration docs to read but not the branch to read them from,
  so a tick reads `main` — whose copies lag, because the home branch never merges there. Fixed
  locally in PR #116; `agent-scaffold` has the same gap. Filing it needs the named credential or a
  direct owner ask, same bar as the other two.
- ~~**The accounts chain needs approval per step**~~ — **wrong, and corrected 2026-09-05.** This
  bullet said #105/#86/#87 each still needed their own `/orchestrate approve`. `DECISIONS.md`'s
  "Standing approval: the accounts workstream (#105, #86, #87)" says the opposite in as many words,
  and the owner re-confirmed that reading live. The per-step phrasing predates that record and was
  carried forward by successive cursors; it is what two ticks then acted on, one of them reporting
  the chain blocked on an approval that had already been granted. **#105, #86 and #87 need no
  `approved` label**, only the standing approval already on file — and it stops covering any of them
  the moment its scope grows past the spec. #84 and #85 carry their own labels and shipped.
  Unchanged and untouched by any of this: no agent may ever add the `approved` label itself.
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

- **2026-09-06 (#86 unblocked but not started — account session limit):** The owner completed the
  round trip #86 was gated on ("worked") and separately confirmed their history survived #110's
  read-scoping ("yes i see it"). #86 relabelled `blocked` → `ready`, claimed, and dispatched under
  the standing approval — then the executing subagent was killed by the account's session rate limit
  (resets 03:30 Europe/London) **before doing any work**. No worktree, no branch, no commits, no PR;
  nothing to salvage, unlike the #105 and #110 recoveries. Claim cleared.

  **Deliberately not retried inline.** #86 is the change that can lock the owner out of their own
  history, the account is at its limit so a controller-run attempt could be cut off mid-change, and
  this tick is far past the GUARDRAILS token budget. Checkpointing is the correct move over pushing
  through — the exact case the budget rule exists for.

  **Resume note:** #86 is `ready`, unblocked, covered by the standing approval, and needs no new
  owner input. Its scope is the *narrowed* one in the 2026-09-05 issue comment, not the stale issue
  body: swap `acting_profile_id(conn)`'s body for a real session lookup, delete
  `_default_profile_id`, gate `/api/events`, trim `/api/health`, add the frontend route guard and
  401 handler #105 left out. #84's open-gate test and `App.test.jsx`'s no-session test must be
  *flipped*, not deleted — they were written to be flipped here. Two properties need tests, not a
  manual check: the seeded profile logged in sees all 2 sessions / 33 sets, and no state exists
  where a logged-in owner gets an empty app. Do not deploy without asking — merging is safe, the
  deploy is what closes the door.

  Also this tick: owner's standing preference recorded — **drive the browser to verify a flow
  rather than handing the owner the verification** ("you can test in browser next time").
- **2026-09-06 (UI review delivered; work boarded and sequenced, not started):** The whole-app UI/UX
  review the owner asked for landed and is committed at
  `docs/superpowers/audits/2026-09-06-ui-review.md` (PR #128), plus an artifact for reading on a
  phone. Verdict: adequate-to-good, but the screen that matters most is the least designed — the
  primary button walks down the card as you log, auto-advance hides the exercise it advanced to
  behind the fixed header, set delete is the app's only unconfirmed destructive action, and a flaky
  connection wedges the button for up to 75s because `req()` has no timeout. It also measured what
  nobody had: the recovery disclaimer, which the recovery spec insists must always be visible, is
  the least readable text in the app at 2.61:1.

  **Boarded as #129 (Wave 1, the gym path), #130 (Wave 2, the screens around it), #131 (Wave 3,
  consistency debt)**, all `blocked` — behind accounts, by owner call. I had started setting up to
  execute Wave 1 off the back of "plan looks great"; the owner corrected that in the same breath:
  they wanted the work *filed and prioritised*, after login and user setup. Approving a plan is not
  authorising its execution, and that is now a `DECISIONS.md` entry rather than a lesson to relearn.

  The review's reject list is worth keeping visible, since it is the answer to the owner's standing
  "efficient, not overengineered" constraint: no component library, no CSS framework, no state
  manager, no offline sync layer, no set typing / RPE / plate calculator / supersets. It also names
  the non-UI risk nobody had written down — the fixed 4-day plan with no add-exercise is what breaks
  when users 2-4 arrive with different programs.
- **2026-09-06 later (Tailscale URL made canonical; I downgraded production and caught it):**

  **Owner settled the URL:** `APP_BASE_URL` is now `https://rpi-homeassistant.tailce23b4.ts.net`.
  The reason mattered more than first stated — the LAN IP and the tailnet hostname are two origins,
  so they hold **two cookie jars, two service-worker caches and two installed PWAs**. That, not a
  bug, is why the owner saw "Log in" while believing they were logged in (session on one origin,
  browsing the other) and why a deploy appeared on their laptop but not their phone. Fresh invite
  minted and sent from the new base URL.

  **Incident, self-inflicted:** restarting the container to pick up the new `.env` with a bare
  `docker compose up -d --force-recreate` — no `APP_COMMIT` — resolved
  `image: ...:${APP_COMMIT:-latest}` to `:latest`, **an 11-day-old pre-auth build (`5247896`)**.
  The app came up healthy and wrong: no auth, no mail, no SPA fallback, `/api/health` reporting the
  old commit. Nothing warned. Caught only because an unrelated command failed with `module 'main'
  has no attribute 'RESEND_API_KEY'`, which made no sense against the deployed commit. Repaired with
  an explicit `APP_COMMIT=3e5389e`; data verified intact afterwards (schema v6, 1 profile / 2
  sessions / 33 sets, matching the pre-deploy snapshot — only analytics `events` grew). Filed as
  **#126** with the real fix: make the tag required (`${APP_COMMIT:?...}`) so it fails loudly, and
  delete the `:latest` tag that exists only as a trap. The compose file already *documented* this
  hazard, which is exactly why documenting a footgun is not the same as removing one.

  **Four issues filed and boarded**, two asked for by the owner and two found doing the work:
  **#124** logout must lock the app and leave nothing on the device (blocked on #86; the PWA
  precache and `restTimerStorage`'s session-keyed entries are the real leak surface), **#125** make
  a deploy reach every device and show the running version (builds on the existing `autoUpdate` +
  visibility-check machinery rather than replacing it, and keeps the mid-workout suppression),
  **#126** above, and **#127** `bootstrap_owner.py` is not in the image so its own documented
  invocation fails — the one path a new deployment cannot skip.

  **#86 stays `blocked`**, now on the owner's hand-test rather than on #105. Commented there.

  A whole-app UI/UX research review is running; the owner asked for a review, not a rewrite, so it
  produces a report to choose from rather than a PR.
- **2026-09-06 (the owner used it, and it was broken three ways):** #105 was reported to the owner as
  ready to try after tests, a code review and a health-checked deploy. None of that had *looked at
  it*. The owner opened it and hit three defects in a row.

  **#120 was the real one: every client-side route 404'd.** `/login`, `/history`,
  `/set-password?token=…` — all `{"detail":"Not Found"}`. `StaticFiles` serves files and knows
  nothing about routes the bundle resolves at runtime, so the app only ever worked because every
  route was reached by clicking. That made **#85's invite email unopenable since the day it
  shipped** — there had never been a way to set a password, which is why login could not be used at
  all. Fixed in PR #121 with `assets/` and `api/` deliberately still 404ing, and the regression
  tests whose absence let it ship. Found by loading the URL, not by reading anything.

  **#118 was two more:** the top bar named you when you had **no** session (it fell back to
  `/profile/me`, so a username and a "Log in" link showed together — "signed in, no way to sign
  out"), and `index.html` was served with no `Cache-Control` at all, so a phone could hold the
  previous build indefinitely while the server ran the new one. Both in PR #119.

  **Then the UI itself.** The owner: "it's nothing to standards expected login… messy very messy."
  On `/login` the words "Log in" appeared three times — the TopBar action, the TopBar page-label
  eyebrow beside it, and the `<h1>` — and the app's bottom nav sat on both auth screens. A UI/UX
  review (PR #123) made both auth routes chrome-free with one "Back to workouts" link, gave the
  fields a border, a 2px focus ring, 48px height and a show/hide toggle, moved the 12-character rule
  beside its field, centred the layout, and rewrote the developer-framed copy. It also found two
  things nobody had flagged: the error state was signalled by fill colour alone (now `aria-live`
  plus a danger border) and `.btn-primary` had no disabled state despite five call sites disabling
  it. 275 unit tests (was 259) and 16 Playwright (was 14). Deployed as `3e5389e` and **screenshotted
  before being reported** — the new gate, applied to itself.

  **Process consequence, owner's call, now in `DECISIONS.md` and PLAYBOOK step 5 (PR #122):** any
  UI-touching change needs a UI/UX review of the *rendered* screen and someone to actually open it
  in a browser, and both carry an explicit "efficient, not overengineered" constraint. The
  justification is this tick: three defects through a green 259-test suite and a code review, all
  three obvious in the first screenshot.

  Owner also settled `APP_BASE_URL`: the LAN IP stays for now since it works over the VPN, to be
  revisited later — not a bug, a deferral.

  Four `IMPROVEMENTS.md` entries logged (cursor to 16): `gh pr merge` from a worktree printing a
  scary-but-harmless git error, `AGENTS.md`'s stale test counts, no lint step in CI, and an
  inconsistent sandbox heredoc refusal.
- **2026-09-06 (owner tried #105; two real bugs, both fixed and deployed):** The first human use of
  the accounts UX did exactly what splitting #105 out of #86 was meant to make it do — it found
  problems while the app was still open, so the fix was an ordinary deploy rather than a recovery.

  **Bug 1, the reported one:** `TopBar` fell back to `/api/profile/me` when there was no session, so
  a logged-out visitor saw a username *and* a "Log in" link simultaneously. Accurate (anonymous
  writes really are attributed to the seeded profile until #86) and unreadable: it looks like you
  are signed in with no way to sign out. #105's own scope had said the bar reflects *session* state;
  the fallback quietly contradicted it. Identity there now requires a session, with a test asserting
  the logged-out bar names nobody and never calls `/profile/me`.

  **Bug 2, found while diagnosing the first:** the frontend is served by Starlette `StaticFiles`,
  which sets `ETag`/`Last-Modified` but never `Cache-Control` — confirmed against the live server,
  where `index.html` returned no `Cache-Control` at all. Since Vite fingerprints everything under
  `assets/`, a stale `index.html` pins the whole app to the previous build with no error and no
  clue. That silently undermined **every** deploy this project has ever done, not just this one.
  Fixed: unfingerprinted files revalidate, fingerprinted assets are immutable. Verified on the live
  server after deploying.

  Diagnosis went to the deployed artifact rather than the source: grepping the served bundle proved
  the new code *was* shipped, which ruled out a bad deploy and pointed at the two causes above.
  A direct read of the production DB (to check whether a password is set) was refused by the
  sandbox; that was reported to the owner rather than worked around. Filed as #118, shipped as
  PR #119 (`73ebdce`), backend 186 tests, frontend 259.
