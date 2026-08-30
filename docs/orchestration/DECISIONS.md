# Orchestration Decisions

> Append-only log of owner decisions made during `/orchestrate` runs, so the runner never relitigates
> them. Newest at the top. Format: `## <date> — <short title>` then 1-3 sentences of the decision + why.

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
