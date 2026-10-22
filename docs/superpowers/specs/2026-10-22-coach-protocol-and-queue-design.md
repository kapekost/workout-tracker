# Coach protocol and queue: design

**Date:** 2026-10-22
**Status:** Draft for owner review. Project 1 of 4 (see "Order of work"). Nothing here is built.
**Issue:** #428 (coach persona and direct AI calls). Evidence base:
`docs/superpowers/research/2026-10-22-coach-persona-and-split-evidence.md`. Training-science limits that
bind the coach: `docs/superpowers/research/2026-08-16-recovery-science.md` section 7.
**Builds on:** the manual flow shipped in #223 (export, paste back, preview, confirm). That flow stays as
a fallback and as the proof that the confirm step works.

## Intent and why

The app should have a coach that plans and adjusts training from science, not from whatever an AI
chat happens to say. Today the user copies a prompt and data into an outside chat and pastes a reply
back. The owner wants that to become part of the app: the app asks the coach for something, the coach
works on it later, and the answer shows up in the app. The coach also needs to ask the user questions
when it lacks information, and the owner needs to see what the coach costs, how well it works, and what
users say when it goes wrong.

This document designs the channel between the app and the coach (the protocol and queue) and the
visibility around it. It does not design the coach's training knowledge (project 2) or the profile
questions themselves (project 3).

## Decided by the owner

- One shared coach persona serves plan building and plan updating, each with its own thin output format.
- The coach asks the user for what it needs when it needs it. There is no long setup form up front.
- Work moves through typed, stateful items that are handled on an asynchronous cycle, not live.
- The work is done by an agent session that runs outside the app, like the orchestrator, using
  specialist agents and skills. A server-side worker that calls a model API directly comes later.
- Users: invite-only now. The app opens to the public when the mobile app ships.
- The backend owns the coach logic and the frontend stays thin, so plans and updates can change without
  shipping a new app.
- The owner needs visibility of the work: cost, efficiency, and user feedback about problems.
- A strict architecture review of this design happens before any plan or code.
- Slow and careful, not rushed.

## Goals

1. A user can ask the coach for a plan or an update and later see a proposal they can preview and
   confirm, as they do today.
2. The coach can put a question to the user and the user's answer returns to the same piece of work.
3. Every piece of work has a type and a state, and its history is recorded.
4. The worker is replaceable: the external agent session now, a server-side API worker later, with no
   change to the app, the item types or the states.
5. The owner can see volume, waiting time, outcomes, cost and user feedback.
6. Users can say when something went wrong and the report is tied to the work that caused it.

## Non-goals

- The coach's training principles, evidence index and evaluation set (project 2).
- The profile questions and where answers are stored on the profile (project 3).
- The public-scale worker, billing, and rate limits per user (project 4, parked until mobile).
- Real-time or in-workout coaching.
- Nutrition (#33 needs its own sourced research).
- Flexible training days (#430 and #431), which run separately. This design only needs the coach's
  reply format to be able to carry a day operation later.

## Anti-goals (a failure even if it works)

- The coach changes a user's plan without the user confirming it.
- Free text a user typed acts as an instruction to the agent.
- A user's identity, email or login credentials reach the agent.
- Another invited user's data is visible to a user, or to the agent in the same context as someone else's.
- The owner cannot tell what the coach cost or whether it is helping.
- The design cannot be moved to a server-side worker without rewriting the app.

## Constraints

- One Docker container, SQLite, FastAPI, schema now v9. Any new tables are a schema change (v10): they
  need a backup and an admin export before deploy, and a restore drill.
- Every data endpoint needs a session today (#86) and resolves the profile through `acting_profile_id`.
  Cross-profile access returns 404. New endpoints follow this.
- The repo is public: no keys, hosts or machine paths in tracked files.
- The coach must not show a recovery percentage or a "readiness" score, and must follow the other
  limits in the recovery-science note.
- The app must keep the existing strict validation of plan changes (`POST /api/plan/update` schema).
- Keep it simple: one table for the queue is better than a framework.

## Design

Everything in this section is the author's call unless it appears under "Decided by the owner".

### Items

A coach request is one row. Its type says what is wanted; its payload carries only what the coach needs.

| Type | Raised by | Meaning |
|---|---|---|
| `plan_build` | user | Make a plan for this person |
| `plan_update` | user | Adjust the current plan |
| `progress_review` | user | Summarise recent training (user-raised only in v1) |
| `question` | coach | The coach needs something from the user |
| `answer` | user | The reply to a `question` |

Results are separate records linked to the request: a `proposal` (a plan change in the existing update
schema, plus a plain-language summary and a reason for each change), a `message`, or a `question`.

### States

`queued` -> `claimed` -> one of `waiting_user` (a question is out), `ready` (a proposal or message is
available), or `failed`. From `ready`: `applied`, `declined`, or `expired`. From `waiting_user`, an
answer returns it to `queued`; a Skip returns it to `queued` with a note that the coach decides; an
unanswered question ends the request as `expired` after the expiry period. A user can cancel while
`queued`. Only one open request per profile and type; a second returns 409, as for sessions (#247).
Applying re-validates the proposal against the plan as it is now and refuses with a plain message if
the plan changed since the proposal was made. A `claimed` item has a lease with an expiry so a worker that dies
releases it; the lease length and retry limit are the builder's call.

### Two sides, two credentials

- **User side** uses the normal session: create a request, list my requests, answer a question, preview
  and confirm or decline a proposal, send feedback. The confirm step reuses the existing apply path.
- **Worker side** uses a separate machine credential that can only: claim the next item, read that item's
  minimised context, post a result, and report a run record. It cannot read or write plans, profiles,
  sessions or anything else. It is not an admin session and not a user session.

### Context the worker receives

Built by the backend per item and minimised: the plan, recent sessions, personal bests, the profile facts
the coach has been given, and the user's notes. No username, email, profile id or any other identity;
the worker sees an opaque item id. One item per claim, so two users' data never share a context.
User-typed text is passed in a field marked as data, and the worker instructions say it is never to be
followed as an instruction.

### Consent

Before a user's first request the app records an explicit opt-in saying their training data is sent to
the coach service. No consent, no request. The text of the consent and its version are recorded with
the answer. For invited users this is a simple screen; for the public it must be revisited.

### Swappable worker

The worker side is defined as a small contract (claim, context, result, run report) and nothing else.
The external agent session implements it by calling the worker endpoints. A later server-side worker
implements the same contract inside the backend. The user side and the items do not change.

### Backend-driven results

The backend returns results as typed structures (proposal with per-change reasons, question with its
answer type, message), and the app renders them with generic components. New result kinds should not need
a client change beyond adding a renderer. The static plan in `workoutPlan.js` is not part of this design.

### Visibility

Each worker attempt writes a run record: item id, worker kind, start and end, outcome, and for model
use the model name and token counts. Cost is computed from tokens where a price is known; where the
worker is an agent session whose usage is not metered per item, cost is recorded as "not metered" and
the owner sees counts and time instead of an invented number. The owner sees, in an admin-only view:
items by type and state, queue wait and processing time, apply, decline and failure rates, cost and
tokens where known, and recent feedback. User feedback is a small record tied to an item: a problem
category (wrong advice, unclear, too much, other) plus an optional note, available on any proposal or
message. Feedback and run records contain no identity beyond the item id and, for the owner's view, the
profile id.

### What the user sees (adjudicated after a UI pass and a UX pass)

Mobile first, one-handed, dark theme, existing tokens and components only (`Chip`, `Eyebrow`,
`StatPair`, `DisclosureRow`, `EmptyState`, `Toast`, `btn-primary`, `btn-secondary`, `card`). No new
component layer. The coach lives on the Plan page and replaces "Update with AI" for opted-in users.

1. **Entry.** One `btn-primary` "Ask your coach" opens the ask view (build or adjust, plus an optional
   one-line note). With an open request, the button is replaced by that request's status card, so Plan
   shows one coach thing at a time. A second request of the same type shows a disabled button and
   "You already have a request in progress".
2. **Consent (first time).** A bottom sheet with two short lists, Sent (plan, recent sessions, personal
   bests, notes as written) and Not sent (name, email). Says who reads it ("an AI coach service") and how to
   stop (Settings, Coach). Agree is `btn-primary`; Not now is a text link of the same tap size. No
   pre-ticked box. Information tone, not warning colours. Focus moves to the heading.
3. **Status card.** One card shell for the life of a request: state label and icon top-left, absolute
   timestamp top-right ("Sent today 14:05"), request type as an `Eyebrow`. States are told apart by
   label and icon, not by colour alone: sent and working muted; needs answer and ready accent; applied
   success; failed on `dangerBg`. A 3px accent left edge only for needs answer and ready. Copy: "Queued"
   until a worker has claimed it, "Being worked on" after. Wait text: "Open Plan later. We will show it
   here. Your coach reviews requests in batches, so this takes a few hours." No spinner, no progress bar,
   no animated dots. "Cancel request" while queued.
4. **Finding the result.** In-app only in v1: a dot with the text alternative "1 coach result ready" on
   the Plan nav item and on Home, and the card pinned at the top of Plan. A question waiting for an
   answer raises the same dot. No email or push is promised.
5. **Question.** Pick-one answers are `Chip` toggles in one wrapped row (44px targets); numbers and
   short text use the existing inputs with a visible Send above the keyboard and a character limit.
   "Skip, let the coach decide" is a low-emphasis text button under the answer.
6. **Proposal.** A summary card, then every change in the proposal, never a folded list (a proposal is capped at ten
   changes by the schema, so all of them fit and a harmful change cannot hide). Each change is a `StatPair`
   (exercise name, old value muted, new value) followed by a one-line reason in `muted2`, two lines max.
   A reason needs the user's own data or a short plain-language gloss of the principle; a change with no
   data behind it says "general advice". Reuse the existing preview styling. Buttons: **Apply** and
   **Not now, keep for later** stacked full width with a 16px gap and 48px height (my call: the UX pass
   wanted them apart against stray taps, the UI pass wanted them side by side; stacked is the safer
   reading, to be settled by a mockup). Apply is `btn-primary`. A "Something wrong?" row sits directly
   under them.
7. **Feedback.** A 44px row, never accent. Category buttons (wrong advice, unclear, too much, other) as
   `Chip` toggles, an optional note, then a `Toast`: "Thanks, this is recorded." Also on question,
   failed and expired cards.
8. **Expired and failed.** Expired: "This request ran out of time. Send it again." with a Send again
   button prefilled with the old note. Failed: "The coach could not finish this." with a note field right
   there and a Try again `btn-secondary`. Never a raw error.
9. **History.** The last ten requests in `DisclosureRow`s, state shown as a small label (applied
   success, declined and expired muted, failed danger), open requests pinned on top, `EmptyState` when
   none. A past proposal opens read-only; Apply is disabled with "Your plan changed since this was made".
10. **Accessibility and copy.** Status changes announce through `role="status"`; focus moves to a new
    proposal's heading; all targets at least 44px with 8px gaps; reduced motion respected; state never
    colour alone. Plain short sentences, no em dashes. No recovery percentage or "readiness" anywhere,
    and no "science-based" or "optimised for you" labels. Near the ask note: "This is not medical advice.
    See a professional for pain."

Not adopted: an Undo after Apply (the app has no undo pattern today and a plan can be re-edited from the
Plan page; revisit if users ask). Mockups worth drawing before building: the six-state card row beside
the history list, the proposal with stacked buttons versus a pinned bottom bar, and the Plan page with
one coach button.

The owner's admin view (counts, waiting time, outcomes, cost, feedback) is a separate plain page for the
owner only.

### Safety rules the backend enforces

- A proposal is validated against the existing plan-update schema before it can be shown. Anything else
  is `failed`.
- A proposal can only touch the requesting profile's plan.
- A proposal is never applied without the user's confirm.
- Items expire if nobody looks at them; the period is the builder's call.
- The manual copy and paste flow stays available and is unaffected.

## Calls the author made (check these)

- `plan_build` needs a new reply schema, because the current update schema rejects a day that does not
  exist yet. It therefore depends on #430. Version 1 ships `plan_update`, `question`/`answer`, feedback
  and the visibility page; `plan_build` follows #430.
- `progress_review` is raised by the user only in v1; no scheduled requests.
- Notification is in-app only in v1 (dot and pinned card). Email through the existing mail provider is
  possible later but changes the consent text, so it is a separate decision.
- Before project 3, the coach receives only the plan, sessions, bests and notes. Answers to its questions
  stay on the request. Project 3 decides what becomes a stored profile fact.
- The new tables join the whole-database export used for restore, so a restore does not lose coach
  history. Whether they are also removed with a profile follows the retention answer below.
- A stale proposal is refused at apply with a plain message, not silently merged.
- Apply and Not now are stacked full width (see the UI section).

## Decisions from the discovery session (author's synthesis, owner approval pending)

Sources: `docs/superpowers/research/2026-10-22-hosting-and-agent-access-options.md` and
`2026-10-22-coach-data-retention-advice.md`, challenged by a staff-engineer review and a security review.

**Seam and transport**
- The seam stays: a small worker contract over HTTP with a scoped token. The same contract serves a
  server-side worker later.
- v1 transport is the local network. The agent runs on the same network as the app, so the token is
  useless off it. A private overlay network is added only if runs get skipped. A public route is a
  later step and needs a fresh human approval (GUARDRAILS, "making a previously private deployment
  reachable from the public internet"); record it in DECISIONS.md when decided.

**The coach agent is isolated**
- The coach runs as its own scheduled job with its own identity and a stripped environment: no GitHub or
  shell tools, no deploy credentials, no filesystem beyond a scratch directory, no network except the app's
  worker host. It is never the orchestrator's session. Test it as the CI reviewer was tested: an injected
  note asking for a command must fail.
- Output is treated as untrusted too: proposal summary and reasons get length caps, URL, HTML and markdown
  stripping and a secret-pattern check before the user sees them.
- The agent's own transcripts and logs hold user data outside the app's retention clock. Persistence is
  turned off for the coach job, or the transcripts join the retention list.

**Worker token (minimum, not left to the builder)**
- Stored hashed, shown once, with a recognisable prefix; one documented rotation command with overlap and
  one revocation command that also ends open leases.
- Four routes only (claim, context, result, run report), enforced by a dependency that rejects any user
  session there, and user routes reject the token. A test proves the token gets 401 or 403 everywhere else.
- A claim returns a lease id. Context, result and run report need the item id and the lease id; context
  is returned only for a currently claimed item with an unexpired lease. Result posting is idempotent and
  lease-bound: a late result or a replay is rejected. A retry cap stops a poison item looping.
- Every call is audited (token id, item id, address) and rate-limited. The owner sees a heartbeat and an
  alert on silence or on unusual claim volume.

**Consent and the provider**
- The backend refuses to build context for a profile without a current consent and checks again at claim
  time, so a withdrawn consent stops queued items. Withdrawal is in v1.
- Consent text names the AI provider and its retention, and notes are capped in length.
- **The coach uses an API key under the provider's commercial terms, not the owner's subscription.** The
  plan terms bar automated access except through an API key and tell anyone building a service to use one;
  commercial API data is not used for training and is kept 30 days by default. Safety-flagged content can be
  kept up to two years on every route. Source: `docs/superpowers/research/2026-10-22-ai-provider-terms-options.md`.
- **Two hard findings from that research.** The provider's own API cannot pin processing to the EU, so
  the consent text must say plainly that processing happens outside the EU under standard contractual
  clauses, or the route changes to a cloud provider's EU endpoint later. And the provider's data
  processing addendum lists special categories of data as "none", which clashes with health-adjacent notes:
  get written confirmation, or send no such data (cap and warn on the note field).
- **Still to do before friends use the coach:** the owner creates the API organisation and key, and the
  unverified items in that file (subprocessor list, written confirmation of the above) are checked.

**Retention (minimum viable)**
- One rule: coach text (request notes, answers, proposals, feedback notes) is cleared 30 days after a
  request reaches a final state. Consent records (text version and timestamp) are kept while the account
  lives. Run records hold no free text. All coach tables cascade from the profile.
- A daily purge job does the clearing. The container has no scheduler today, so the purge runs as a
  startup sweep plus a sweep on worker calls (builder's call on the exact trigger).
- After a restore, re-delete the profiles listed in the deletion notes (a runbook line). An automated
  deletion log replay is built before the app opens to the public. Hosted copies (backup buckets, replicas)
  join the retention list when the app leaves the Pi.
- GitHub or any issue tracker never holds user text. Keep that as a rule in GUARDRAILS with a check.

**Hosting (decided at move time, not now)**
- Stay on SQLite in one container. When the app leaves the Pi, add continuous replication (Litestream or
  equivalent) to an EU bucket and test a restore. Choose between a small VPS and a platform host then;
  expect a few dollars to about six dollars a month, since no host's free tier fits this footprint.
- Do now, because it is cheap and pays off in any move: make the Dockerfile multi-architecture (it hardcodes
  an arm64 binary), add a container health check, keep timestamps in UTC, and run a restore drill for v10
  before friends sign up. Do not add a database abstraction layer or rename `DATABASE_URL`.

## Calls from the discovery session that still need the owner

1. Create the API organisation and key under the commercial terms, and confirm in writing how health-adjacent notes are treated (see the provider research).
2. Settled: the coach is a separate stripped job, triggered when we do a tick (owner, 2026-10-22).
3. Settled: in v1 the agent runs from the owner's side during a tick, on the local network (owner, 2026-10-22).

## Left to the builder

Table and column names, lease and retry numbers, expiry periods, the machine credential mechanism
(subject to the review below), the admin view layout, the feedback categories' final wording, and how
the external agent is scheduled and prompted.

## Order of work

1. This design (protocol, queue, visibility). Gets the architecture review.
2. The persona module: versioned principles with their evidence, the evaluation set, the two output
   formats, and a way to keep improving them.
3. Profile and questions: what the coach asks and where answers live.
4. The public-scale server-side worker, after mobile.

## Architecture review (to run before any plan)

Reviewers: staff-engineer-reviewer and security-ai-reviewer. They check at least: the machine credential
(scope, storage, rotation, revocation); prompt injection through notes, answers and feedback; data
minimisation and what leaves the container; consent record and its versioning; lease and retry
correctness; the confirm gate; the schema change and restore path; the admin view's access; and that the
worker contract really is enough to swap the worker without touching the app.

## Open questions for the owner

Answered by the discovery session, pending the owner's approval of this document: transport and hosting
(local network first, host chosen at move time), retention (one 30-day rule), and who uses it (friends,
when the mobile app ships). The three calls above are what remains.
