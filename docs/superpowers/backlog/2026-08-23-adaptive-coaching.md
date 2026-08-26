# Adaptive coaching / AI-in-the-loop programming (captured 2026-08-23)

**Update 2026-08-26: migrated to the GitHub Issues board** as [#32 Adaptive
coaching / AI-in-the-loop programming](https://github.com/kapekost/workout-tracker/issues/32)
(`intake`, open questions unresolved — see that Issue and this file for the
full fork/question list). This file stays as the full brainstorm record the
Issue links back to.

**Status: CAPTURED, NOT DESIGNED.** Per the convention in
`docs/superpowers/backlog/2026-08-16-next-workstreams.md`, this needs its own
`superpowers:brainstorming` → spec → plan → implementation cycle before any
code is written. This document exists so the idea and its constraints survive
the gap until that happens; it is deliberately not a design.

**Asked** (paraphrased from a rough, in-the-moment note): "Let's make a good
researched adaptive plan of workouts, not random stuff, and a way for an AI
agent to think about updates before and after a workout, maybe even during.
Maybe a section to export, a prompt to give to Claude, or in the future to
interact with Claude directly."

This bundles two related but separable ideas. Keep them separable in
brainstorming even if they end up shipping together:

- **(1) A more adaptive plan.** Today's `PLAN` in `workoutPlan.js` is a fixed
  4-day Upper/Lower split with sourced rep ranges per exercise. It is not
  "random," but it is also not periodized: there's no deload logic, no
  exercise rotation/substitution, and (until today) the one progression
  mechanism it had wasn't even wired up correctly (see "What exists today").
- **(2) An AI agent in the loop**, reviewing training data at some cadence and
  proposing changes, plus an **export/prompt surface** to talk to it: today
  via copy-paste into Claude.ai, possibly via a live API call later.

## What exists today

- **`frontend/src/lib/overload.js`**: `overloadSuggestion(lastSets, repsHigh,
  increment=2.5)`, a single-exercise, single-heuristic progression rule
  ("hit the top of the rep range on every set, then +2.5kg next time, else
  repeat"). No periodization, no deload, no exercise substitution. As of
  this session's fixes, `prefillFor` (`workoutFlow.js`) actually *uses* this
  suggestion when starting a workout. Previously it silently prefilled last
  session's raw weight, ignoring its own "Suggested Xkg" hint shown right
  next to it. That bug is fixed, but the underlying suggestion logic is still
  just the one heuristic; "adaptive plan" as asked is asking for more than
  this.
- **`frontend/src/lib/recovery.js` + `docs/superpowers/research/2026-08-16-recovery-science.md`**:
  a per-muscle-group freshness *estimate*, deliberately conservative: three
  bands (not a percentage), no fitted per-user parameters ("there is no
  ground truth to fit against"), and a binding §7 Limitations list on what
  the app is allowed to claim (never "readiness," never a numeric recovery
  score). **Any AI-authored copy this workstream ever shows a user inherits
  these same limits.** An LLM confidently inventing precision the app's own
  research doc explicitly disclaims would be a regression, not a feature.
- **`frontend/src/lib/exportData.js`**: `downloadExport()` dumps the full
  `/api/export` envelope (raw sessions/sets/notes/PRs) as a JSON file. This is
  a disaster-recovery/backup format, not a curated, prompt-shaped summary.
  It's the right *data source* for a coaching export, not the export itself.
- **Backlog item C** in `2026-08-16-next-workstreams.md` ("Import: bring
  outside training in") already captured half of idea (2) from a different
  angle: *"the deliverable is really two artifacts: a strict versioned JSON
  schema the app accepts, and a copy-pasteable prompt the user hands to an
  AI... Never let a third-party AI's output write directly to the database
  unseen."* That review-before-commit principle should extend to this
  workstream too, for the same reason: a coaching suggestion is a guess, not
  ground truth, until a human confirms it.
- The nutrition item in `AGENTS.md`'s Backlog section (deferred from the
  muscle-recovery design) is also AI/coaching-adjacent and may belong in the
  same brainstorming session rather than being scoped separately.

## The central fork brainstorming must resolve first

**(a) Manual export-a-prompt.** The app generates a structured, readable
summary (recent sessions, adherence, PRs, muscle-group freshness bands, notes)
plus a fixed prompt template; the user copies it into Claude.ai (or any LLM)
themselves and gets recommendations back as prose. No API key, no recurring
cost, no new outbound dependency for the Pi. Ships fast, and matches this
app's existing single-user/no-auth/public-repo posture.

**(b) Live API integration.** The backend calls the Anthropic API directly.
Needs a secret that must never be committed (this repo is public, confirmed
swept clean 2026-07-16): an env var on the Pi's `docker-compose.yml`, not in
the image. Ongoing per-call cost. A new outbound network dependency baked
into a core flow, on a device (Pi 3 B+, ~1 GB RAM) that has already had
under-voltage and crash-loop incidents, and inside an app whose own UI/UX
backlog item (D) states the device is used on "often poor wifi." If (b) is
ever wanted, it should be optional and async. It must never gate core
set-logging on a network call succeeding.

Recommendation for brainstorming to weigh, not a decision made here: **start
with (a).** It's the cheaper, lower-risk path to the same first value (a
human reviewing their own data with an AI's help), and it's compatible with
"or in the future to interact with Claude directly": (a) can be a stepping
stone to (b) rather than a dead end.

## Questions brainstorming must settle

1. **(a) vs (b).** Or (a) now, (b) explicitly deferred as a v2? See fork above.
2. **Cadence.** "Before, after, maybe even during" a workout were all named.
   Before/after are each a single decision point with time to think; during
   competes directly with the app's stated core interaction ("one-handed,
   sweaty, glanceable... logging a set between efforts," UI/UX backlog item
   D). Recommend scoping "during" out of v1 regardless of (a)/(b), but this
   is brainstorming's call.
3. **Scope of "update."** Per-session weight nudging is already shipped
   (`overloadSuggestion`, now correctly wired into the prefill). Is this
   workstream about the layer above that (deload timing, exercise rotation,
   volume landmarks), or does it also want to touch the plan structure itself
   (`workoutPlan.js`)? Get specific; "adaptive plan" is vague enough to mean
   either.
4. **Where does AI output land?** A read-only summary the user acts on
   manually (safest, matches item C's precedent), or a "proposed diff" the
   app renders and the user approves/rejects (more useful, more surface
   area)? Never auto-apply silently, same principle as import (item C).
5. **Profiles dependency.** The app is single-user today (backlog item B is
   still undesigned). Does this workstream need to wait on B, or is a
   single-user coaching export fine to ship first and re-scope per-profile
   later?
6. **Research-doc compliance.** Any AI-facing export or AI-authored copy
   shown back to the user must respect
   `docs/superpowers/research/2026-08-16-recovery-science.md` §7: no
   recovery percentages, no "readiness" language, no volume-landmark claims
   the primary sources don't support. Does the export prompt need to *tell*
   the LLM these constraints explicitly, so pasted-in advice doesn't violate
   them either?
7. **If (b) ever ships:** who owns the API cost, what's the rate limit or
   circuit breaker if a call hangs, and does a failed call ever block set
   logging (it must not)?

## Relationship to other captured workstreams

- Extends/depends on the progressive-overload work already in
  `overload.js`/`workoutFlow.js` (2026-06-29 plan). This workstream is the
  layer above per-set weight suggestions, not a replacement for them.
- Overlaps with backlog item C (import prompt) enough that brainstorming
  should consider whether they're one workstream (a general "AI to app" data
  interchange, where export-for-coaching and import-from-notes are two
  directions of the same schema/prompt problem) or two.
- Overlaps with the nutrition backlog item (`AGENTS.md` Backlog) as another
  AI/coaching-adjacent, sourced-guidance feature.
- Not sequenced yet against items A through D in
  `2026-08-16-next-workstreams.md`; add it to that sequencing discussion
  rather than assuming it slots in anywhere specific.
