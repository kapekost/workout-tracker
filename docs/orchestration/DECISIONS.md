# Orchestration Decisions

> Append-only log of owner decisions made during `/orchestrate` runs, so the runner never relitigates
> them. Newest at the top. Format: `## <date> — <short title>` then 1-3 sentences of the decision + why.

## 2026-09-05 — Secrets live in `.env` on the target; reuse services, not accounts

**Mechanism.** Secrets go in a `.env` beside `docker-compose.yml` on the deploy target, gitignored
and mode 600, loaded automatically by Compose. Not `env_file:` — that requires the file to exist, so
a forgotten `.env` on a rebuilt host would fail the deploy; every value has a default instead, and a
missing file means mail stops sending rather than a broken deploy. `AGENTS.local.md` records only
where keys live and where they came from, never a value: a key in a gitignored Markdown file is
still a key in a file people open, copy and quote into Issues.

**Audited before assuming.** All 364 commits scanned for Resend, Google OAuth, SSH, Tailscale, AWS,
GitHub and Slack credential shapes. Clean — nothing to rotate. The CI guard that was meant to
prevent this only checked `.mcp.json` for three patterns, so it was widened to every tracked file
plus a hard ban on tracked env files, and verified against planted secrets rather than only being
seen to pass (PR #111).

**Reuse services, not accounts.** Owner's standing preference, 2026-09-05: use what already exists
and only create something new when there is no alternative. Email therefore stays on the Resend
account `kapekost-web` already uses, with its already-verified `kapekost.co.uk` sender — no new
provider, no new account. The one refinement: take a **separate key on that same account** rather
than literally reusing the website's key, so revoking one app's key does not take the other's
contact form down with it. That is still reuse of the service, which is what the preference is
protecting.

## 2026-09-05 — Standing approval: the accounts workstream (#105, #86, #87)

**This is the standing-approval record GUARDRAILS requires.**

**Spec:** `docs/superpowers/specs/2026-09-04-accounts-auth-design.md`, owner-approved in chat
2026-09-04 and reviewed as PR #83.

**Covers:** **#105** (login and set-password screens), **#86** (flip the gate, delete
`_default_profile_id`, enforce login) and **#87** (export/import role behaviour). #84 and #85 already
carry their own `approved` label and are unaffected.

**Why.** The destructive trigger "changes auth, session, secret, or token handling" fires on every
step of an auth feature by definition, so this one workstream generated an approval request per step
against a design the owner had already read in full. The owner's words: "i have not got much context
per number to review or know... let's trust the process on these approvals." An approval that cannot
be evaluated any better the fifth time than the first is delay, not safety.

**Limits, which are the point of writing it down.** This covers only what the spec describes. If any
of those three grows scope beyond its design doc, it leaves this approval behind and needs a fresh
human one. And it never covers GUARDRAILS' "always needs a fresh human approval" list — in
particular **making the deployment publicly reachable (#27) is explicitly outside it**, which is why
that item was added to the list in the same change.

No agent may add an `approved` label under this, or any other, arrangement. The label stays
human-only; this record simply means those three Issues do not need one.

## 2026-09-05 — Tick summaries are written for the product owner

Owner: "as product owner i need to know what to see and try out to give you feedback next time. not
too brief but also not too verbose." PLAYBOOK step 9 now leads with what is live in product terms
and what to try concretely, flags anything half-built so it is not mistaken for a bug, names the
specific judgement calls where owner feedback would change the next tick, and keeps commits, test
counts and CI to a closing line as evidence rather than content.

## 2026-09-05 — Prove the accounts UX before closing the gate; public access drops to P3

Two owner calls after #84 deployed, both pointing the same way: exercise the accounts system as a
human before anything is enforced or exposed.

**#86 split; the accounts chain is now five steps.** #86 bundled the login screens with the gate
flip, so the first time anyone saw the login flow would have been the same deploy that could lock
the owner out of their own history. The screens moved to **#105** ("Accounts 3/5: login and
set-password screens, before the gate"), which ships them while the app is still open. #86 keeps
only the enforcement — `current_profile` on the data endpoints, deleting `_default_profile_id`,
trimming `/api/health`, gating `/api/events`, plus the route guard and the central 401 handler,
which are the two frontend pieces that only mean anything once something returns 401.

**#105 deliberately ships no route guard.** A guard before the gate would close the *UI* while the
API stayed open — a soft lockout with no safety benefit, since the data endpoints would still answer
unauthenticated. So after #105 the app remains usable with no session, exactly as today, and a
logged-in session changes nothing about which rows are read or written until #86. #105 carries a
test asserting the app still works unauthenticated; #86 is where that test flips.

**The bootstrap is a real Resend send to the owner's own address**, reconfirmed rather than assumed.
It produces the actual email #105 is then tested against, and proves the integration on real
infrastructure before anyone else is invited.

**#27 (public access) → P3.** Its original ask was public access *for 3-4 accounts*, so it was always
downstream of real auth; the remaining risk is not the tunnel but whether invite, set-password, login
and logout work for a human on a phone. Exposing an app nobody has logged into yet only adds surface.
`APP_BASE_URL` remains the single config seam, so this blocks nothing — and `APP_COOKIE_SECURE` stays
`0` until something actually terminates TLS, since flipping it early breaks login silently.

## 2026-09-05 — Plan when it isn't decomposed, not when it's big; plans stop carrying code

Owner review of how the runner decides when to implement. Four calls, shipped as PR #102.

**The plan gate keys on decomposition, not effort size.** The old rule ("`effort:M` or larger and
no linked plan → plan and stop") fired on size alone and cost a whole tick on #84, which arrived
approved with a 315-line spec that already contained the schema DDL, endpoint list, test list and
an explicit "Implementation order" section. Execute when scope, an ordered sequence of testable
steps, named acceptance tests and no open owner question are all present; plan only what's missing.

**Plans carry decisions, not code.** #84's plan was 1091 lines, ~700 of them test and
implementation bodies that get written again during execution — the change authored twice, and an
executor handed finished code to transcribe, which defeats the red step of the TDD the plan asks
for. Plans now hold task ordering, the decisions the spec left open, test case *names*, and the
verification steps easy to skip. ~200-300 lines for an `effort:M` issue; that plan was re-cut to
266 as the reference shape.

**Plans are linked from their Issue** (`**Plan:** <path>` in the body), because no Issue in the
repo referenced one and the gate was reading a directory listing instead.

**`blocked-by` is the `blocked` label.** PLAYBOOK mandated GitHub's native dependency relationship
and forbade a label, but the field it names doesn't exist on this API, so the check had always
silently passed while practice used the label.

**Effort split, soft:** ~60% implementation, ~30% planning, ~10% review, review being regular
rather than terminal — get to running code early so reviews land on code, not prose. Research-heavy
work may take more investigation and should say so in `STATE.md`. Two caveats keep it honest:
review is a gate, not a budget line, and verification belongs to implementation.

**#84 stays `effort:M`, checked rather than assumed.** Its plan runs to six tasks, which reads
large, but that is TDD granularity, not scope: five files touched (`backend/main.py`,
`backend/test_auth.py`, `backend/test_profiles.py`, `backend/requirements.txt`,
`AGENTS.local.md.example`), one cohesive surface, far inside GUARDRAILS' 40-file / 150k-token
split threshold. Splitting further would break the property that makes step 1 coherent — that it
is safe to deploy while the app is still open.

## 2026-09-04 — Backups go manual; no alerting; home branch stops merging

Three owner calls in one conversation, all reversing or settling things decided earlier
the same day.

**Backups are manual.** The cron is removed from the Pi entirely, not just slowed down —
run `scripts/backup.sh` when you want a copy. Local snapshots pruned to two. The
consequence had to be fixed with it: `scripts/deploy.sh` treated a `stale`
`last_backup_status` as a hard deploy failure, so with no schedule every deploy would
have started failing eight days after the last manual backup. It warns now, and `stale`
is reframed as "it has been over a week" rather than "the schedule is broken". #88's
actual mechanism (status file, no unauthenticated write endpoint) is untouched and still
unblocks #86.

**No external alerting.** #89 closed as not planned. healthchecks.io alarms on a ping
that missed its schedule; a manual backup has no schedule, so it would fire forever —
the same "always red, so nobody reads it" failure #88 existed to remove, relocated to
another service. The `HEARTBEAT_URL` hook stays in the script, unused, so reinstating a
cron plus a check later is a two-line change.

**The orchestration home branch never merges to the default branch.** Chosen over
"merge and re-push every time" because one forgotten re-push silently disables collision
protection and nothing reports it. Doc commits go straight to the home branch; when
`main` should carry them, cherry-pick onto a short-lived branch and PR that. Fed back
upstream as `agent-scaffold` PR #2, together with the state-label-on-split-children fix.

## 2026-09-04 — #88 ships end to end: deploy the Pi, then flip the cron

Asked at the deploy boundary, because #88's two halves only work together. The
owner chose to take the tick all the way: merge, deploy, then change the Pi's
crontab to weekly in the same window. Deploying carried the py3.11 to 3.14 base
image bump and pydantic 2.13.5, which had been sitting on main hand-verified but
undeployed since 2026-09-04; those were the only runtime changes in the backlog,
everything else was docs.

The ordering is the point. Flipping the cron before the 8-day threshold is
running on the Pi would leave /api/health permanently stale, which is the exact
failure the issue exists to prevent. Deploy first, cron second, always.

## 2026-09-04 — Accounts: #67 and #68 are one workstream, not a sequence

The 2026-09-02 decision that initial passwords are set through an emailed single-use link makes
#67 and #68 mutually dependent — #67 cannot create a usable account without #68's Resend
integration and token model. Both closed as superseded; execution split into #84-#87 in a hard
dependency chain. Design: `docs/superpowers/specs/2026-09-04-accounts-auth-design.md`.

Sub-decisions taken in the same conversation:

- **No public self-signup.** Admin invites only.
- **The owner's own account bootstraps through the normal invite path**, not a backdoor — schema
  v6 adds `email`, a one-off script sets it on the seeded `kapekost` profile and mints a standard
  invite. This proves Resend end-to-end on real infrastructure before anyone else is invited.
- **Emailed links do not block on #27.** They point at the Tailscale URL now; `APP_BASE_URL` is
  the single config seam the tunnel hostname replaces later. Accepted consequence: the invite flow
  can't be tested with someone outside the tailnet until #27 lands.
- **Export/import gets both behaviours** keyed off `role` — admin dumps/restores everything
  (preserving the disaster-recovery path), members get only their own rows.
- **bcrypt cost 12, not a memory-hard KDF.** Measured on the actual Pi. This is a hardware-driven
  choice, not a security preference: OWASP's scrypt baseline needs 128 MiB against ~185 MiB free,
  and every concurrent memory-hard hash reserves its full working set, so a few parallel logins to
  an unauthenticated endpoint could OOM a container on a box that also runs Home Assistant. Do not
  "upgrade" this to argon2 without re-measuring there.

## 2026-09-04 — Backup heartbeat becomes a file; cron goes weekly

`backup.sh` stops POSTing to `/api/events` and writes `data/backup-status.json` instead, which
`/api/health` reads. Chosen over authenticating the endpoint with a shared secret: a token
guarding a local process that already owns the database file buys nothing, and this deletes an
unauthenticated write endpoint rather than fencing it — which matters once #27 makes the app
public. It also moves backup status out of the database being backed up.

Cron drops to weekly; the app isn't used enough to justify nightly. Revisit from `events` data if
usage picks up.

**`/api/health`'s 26h staleness threshold must move with the schedule.** A weekly cron would
otherwise make it permanently `stale`, and a signal that is always red is one nobody reads — which
is precisely how three consecutive nights of failed off-site backups went unnoticed in
2026-09-01..03. Tracked as #88, and it blocks #86.

Alerting (`HEARTBEAT_URL` → healthchecks.io) deferred to #89 rather than dropped. It is the only
piece that would actively notify rather than wait to be looked at.


## 2026-08-30 — #33 (Nutrition guidance) shaped: standalone, needs bodyweight + height

Owner Q&A: collect both bodyweight and height (new fields) for scientifically-grounded guidance,
not just bodyweight for ISSN protein ranges. Ships standalone, not folded into #32 — doesn't need
#32's AI-export machinery. New fields need real profiles, so this sequences behind #66 too. Still
`intake`, needs its own spec.

## 2026-08-30 — #32 (Adaptive coaching) shaped: manual export v1, before/after only, confirmed profile updates

Owner Q&A: v1 is manual export-a-prompt (option a), live API (b) stays future work. Cadence is
before/after only, "during" scoped out. "Update" scope is a simple layer above existing
per-session nudging, not a `workoutPlan.js` restructure — must be documented once specced. AI
output can propose structured profile/plan updates, applied only after explicit user
confirmation, never fabricated. Sequenced behind the user system (#66/#67). Still `intake`, needs
a written spec before splitting into `ready` work; shares its "structured AI output → confirm →
write" shape with #30, worth one spec pass considering both.

## 2026-08-30 — #30 (Import) shaped: build it, per-profile, simple POC semantics

Owner Q&A: build full-session import (working read of a slightly ambiguous answer — flagged on
the issue for correction if wrong), scoped per-profile. Idempotency: no special handling for now,
POC-simple. Overwrite: add-only by default, upsert-by-id when the imported record already has a
known ID. A future "competition/comparison screens across users" idea came up in passing —
captured separately as #70, not part of this issue. Still `intake`, sequenced behind #66; needs a
spec pass, and shares an architectural shape with #32 (AI-authored structured data, reviewed
before writing) worth considering together.

## 2026-08-30 — #27 direction: keep the Pi, Cloudflare Tunnel, Home Assistant safety is a hard requirement

Owner decided against migrating off the Raspberry Pi — public exposure goes through something
like Cloudflare Tunnel instead (SSL, no VPN). Explicit constraint: the Pi's home network also
runs Home Assistant, so whatever ships must be scoped tightly to this app's own service/port, not
the LAN, and needs a real home-network security review, not just an app-level one. Natural
sequencing: the original ask was public access for "3-4 accounts," which wants real auth first —
this follows #66–#69 (Profiles/auth), even if spec work can start in parallel. Given the stakes,
this goes through a proper spec/brainstorm pass before `ready`, not a quick single-issue
execution. #27 stays `intake` for now.

## 2026-08-30 — Branch auto-delete-on-merge is silently broken, not just manual deletion

`claude/23-node26-docker-build` (PR #65, squash-merged same day) is still present after merging
with the standard `--delete-branch` flow — the same permission gap that 403s a manual `git push
--delete` also swallows the automatic delete-on-merge, silently (the merge itself still
succeeds). This affects every future PR merged by this orchestration, not just historical cruft.
Real fix identified: GitHub's own repo setting, Settings → General → Pull Requests →
"Automatically delete head branches" — a native GitHub feature that runs outside our App's
permissions entirely, so it isn't blocked by the same gap. Recommended over granting the App
broader (Administration-level) permissions, which would also work but is a bigger permission
grant than necessary for this. Owner to verify/enable when next in the repo settings.

## 2026-08-30 — #68 password-reset email provider: Resend

Same-session follow-up to the Profiles decision below. #68 (forgot-password via email) needed a
provider choice before it could be sequenced toward `ready` — chose **Resend**, matching
`kapekost-web`'s existing contact-form integration rather than introducing a second provider.
Needs its own API key, stored in `workout-tracker`'s `AGENTS.local.md` (gitignored) per this
repo's "deployment knowledge stays local" convention — never committed.

## 2026-08-30 — Profiles (#29) shaped: real accounts, prework for OAuth, split into 4 children

Owner Q&A (live, in-session) resolved #29's triage questions. A profile is a real, isolated,
data-owning account, not just a label — explicitly built as prework for adding Google/Apple
sign-in later (not built now; the schema shouldn't preclude it, but nothing OAuth-specific gets
built yet). Existing single-user data migrates to a seeded `kapekost` profile with `role: admin`
(the role is just a column for now — no admin-only behavior specified or built). Profile
selection is a real login gate before Home, not a device-remembered switcher. v1 auth is
username + hashed password with email-based reset, not OAuth. Icons are emoji for now, no need
for a fancier avatar system. Split into #66 (schema/migration, foundational), #67 (login, depends
on #66), #68 (password reset via email — still has one open question, which email provider to
use, since this repo has no existing email-sending capability), #69 (top-bar switcher + emoji
picker, depends on #66). See `STATE.md`'s matching tick-log entry for the full breakdown.

## 2026-08-30 — Concurrent-tick collisions: real claim mechanism, not manual discipline

A recurring routine's first scheduled firing independently picked the same Issue an attended
session was already working live, in a separate session — checked out the same branch, was about
to make redundant edits before being caught and interrupted (no git damage, real cost wasted).
Owner explicitly chose a real fix over relying on remembering to disable the routine during live
work: `PLAYBOOK.md` gained a "Claiming work" section — a tick pushes an In-flight claim to
`claude/workout-tracker-backlog-bu9qnw` the instant it picks an Issue, before any execution; other
ticks check that live branch first and back off on a fresh (<2h) claim; a stale claim is treated
as an abandoned/crashed tick and cleared. Enforced by git's own non-fast-forward push rejection on
that branch, not just cooperative reading. See `STATE.md`'s 2026-08-30 #34 tick log entry for the
full incident.

## 2026-08-30 — Sequencing: ready work proceeds independently of intake triage

`PLAYBOOK.md` step 3's literal old text ("any `intake` Issue preempts all `ready` work") is
superseded: intake triage and `ready`-issue execution are separate, non-blocking tracks. An
untriaged `intake` Issue does not gate an `/orchestrate` tick from picking the highest-ranked
`ready` Issue instead — matches actual practice since 2026-08-26 (#24/#35/#38 shipped while
#27/#29/#30/#32/#33 sat untriaged across several ticks). `PLAYBOOK.md` step 3 reworded to match.
Owner call, prompted by the runner flagging the discrepancy in `STATE.md` rather than silently
picking a reading on its own.

## 2026-08-30 — Merge policy: agent watches CI itself, then merges — no live per-PR ask

Propagated from `agent-scaffold` via `copier update`. After opening a PR: watch CI to
completion (`gh pr checks --watch --fail-fast`) and merge immediately if green — no live
"can I merge this?" per PR. Explicitly not GitHub-native `gh pr merge --auto`: verified
empirically that without branch protection defining required checks, `--auto` merges
immediately regardless of CI state. See `docs/superpowers/specs/2026-08-26-human-agent-collaboration-design.md`
in `agent-scaffold` for the full design.

## 2026-08-26 — MCP server setup is per-project, owner-decided

Don't auto-create `.mcp.json` from `.mcp.json.example` or add MCP servers
speculatively. The owner decides which MCP servers (if any) a given
project actually needs, case by case. If a task seems to need one, ask
rather than guessing.
