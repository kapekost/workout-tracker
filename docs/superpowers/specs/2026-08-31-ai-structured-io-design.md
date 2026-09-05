# AI-authored structured data: Import (#30) + Adaptive coaching (#32) — design

**Date:** 2026-08-31
**Status:** Drafted this tick from owner Q&A already recorded in `docs/orchestration/DECISIONS.md`
(2026-08-30 entries for #30 and #32). Every fork-in-the-road question either issue posed to the
owner has an answer on record already — nothing here is guessed. What's new in this document is
the shared mechanism design and the concrete schemas, which is spec-writer work, not owner-decision
work. Needs a quick owner skim before either issue is split into `ready` children, same as any
spec — not pre-approved the way `2026-08-17-personal-bests-design.md` was (that one was walked
through live; this one wasn't).
**Depends on:** #66 (Profiles schema, shipped) — both workstreams write `profile_id`-scoped rows.
Sequenced behind **#86** (flip the gate), per the existing DECISIONS.md call: importing/coaching
"for a profile" is hollow while every write still lands on the single seeded admin profile. Not
relitigating that sequencing here — restating it so it's not lost between two source documents.

> **Dependency refresh, 2026-09-05.** This doc originally named #67 as the login dependency. #67 was
> closed as superseded (DECISIONS.md 2026-09-04) and the accounts work now runs as #84 (schema v6 +
> auth core, shipped) → #85 (invite/reset email, shipped) → #105 (login screens) → #86 (flip the
> gate) → #87. Separately, **#110 already did the profile-scoping half of what this doc was waiting
> for**: every read and mutation now resolves its profile through one `acting_profile_id(conn)` seam
> (`backend/main.py:63`), and cross-profile `PATCH`/`DELETE` 404 rather than leaking. So the
> remaining dependency is narrower than "real login" — it is #86 swapping that seam's body for a
> real session lookup. Endpoints designed here should call `acting_profile_id(conn)` and inherit
> that switch for free; they must **not** call `_default_profile_id` directly, which #86 deletes.

---

## Problem

#30 (Import) and #32 (Adaptive coaching) point in opposite directions — one brings outside
training history *into* the app, the other sends the app's data *out* for coaching analysis and
brings proposed changes back *in* — but both are the same shape of problem: **the AI runs outside
this app** (Claude.ai or similar, pasted into manually — v1 of both explicitly rules out a live API
call), so the only channel between them is a human copying text. Building each as an unrelated
one-off risks two different review screens, two different trust models, and two different answers
to "how do we know the AI didn't just make something up before we write it to the database" — for
what is functionally one interaction, run twice in opposite directions.

## Scope

**In:** the shared three-step interaction pattern (export/prompt → external AI → paste structured
JSON back → validate → human-readable preview → write only on explicit confirm); #30's additive
session-import endpoint and schema; #32's export-prompt and apply-update endpoints and schemas;
where each's data lands; the minimal "did anything actually change" read surface for #32 (without
which confirming an update would be invisible).

**Out:** any live API integration for either issue (v1 is manual copy/paste for both — #32's issue
explicitly frames this as "(a) now, (b) deferred"). Parsing raw prose *inside* this app — the AI
does that in the external conversation; this app only ever validates already-structured JSON, never
free text. Unit conversion logic in the app (see §3.3 — offloaded to the AI via the prompt
template's own instructions, matching the rest of the app's kg-only, no-conversion-code stance from
the personal-bests spec). Automatic or unconfirmed writes, ever. Any change to
`frontend/src/data/workoutPlan.js`'s fixed day/exercise structure (#32's "update" is explicitly a
layer above existing per-session nudging, not a plan restructure). Wiring #32's proposed targets
into the live workout page's prefill logic — a natural follow-up, not built here (see §4.4).
"During-workout" coaching (#32 scoped this out explicitly; cadence is before/after only).

---

## 1. Decisions already on record (owner Q&A, 2026-08-30)

| # | Question | Decision | Source |
|---|---|---|---|
| 30.1 | Build full-session import at all? | Yes. | DECISIONS.md |
| 30.2 | Idempotency (same notes imported twice)? | POC-simple — no dedup handling. Accepted duplicate risk for v1. | DECISIONS.md |
| 30.3 | Overwrite semantics? | Add-only by default; upsert-by-id when the imported record names a known id. | DECISIONS.md |
| 30.4 | lb→kg conversion? | Not answered directly — resolved in this spec (§3.3): offloaded to the AI via the prompt template, not app code. | This doc |
| 32.1 | Manual export-a-prompt (a) vs. live API (b)? | (a) for v1; (b) explicitly deferred, no timeline. | DECISIONS.md |
| 32.2 | Cadence? | Before/after only. "During" competes with the core one-handed logging flow — scoped out. | DECISIONS.md |
| 32.3 | Scope of "update"? | A simple layer above existing per-session nudging — not a `workoutPlan.js` restructure. | DECISIONS.md |
| 32.4 | Where does AI output land? | A proposed diff the user approves/rejects — never auto-applied. | DECISIONS.md (issue's own Q4, answered by "explicit user confirmation, never fabricated") |
| 32.5 | Must the export respect the recovery-science doc's no-percentages/no-"readiness"-language constraint? | Yes — structural, not just a request (§4.2). | Issue #32 body, `docs/superpowers/research/2026-08-16-recovery-science.md` §7 |

## 2. The shared mechanism

Both workstreams are the same loop, run in opposite directions:

```
Import (#30):    app hands user a prompt template
                 → user + their outside notes → external AI → structured JSON
                 → user pastes JSON into app → validate → preview → confirm → write

Coaching (#32):  app exports the user's own training data + a prompt template
                 → external AI → structured JSON (proposed updates)
                 → user pastes JSON into app → validate → preview → confirm → write
```

**Never let a third-party AI's output write directly to the database unseen** — both issues state
this explicitly, and it's the one hard rule this whole design exists to enforce. Concretely: every
endpoint that accepts AI-authored JSON takes the same `{"envelope": {...}, "confirm": bool}` shape
already established by the existing `/api/import` disaster-recovery endpoint
(`backend/main.py:1123`, model at `:293`) — `confirm: false` (or omitted) validates and returns a
preview summary with **zero** writes; `confirm: true` performs the real write, in a transaction,
rolling back whole on any failure (same pattern as `/api/import`'s existing
`BEGIN`/`commit`/`rollback`, `backend/main.py:1157-1188`). Reusing this convention rather than
inventing a parallel one keeps the review-before-write guarantee in one recognizable shape across
the app.

**Deliberately not sharing backend code between the two endpoints** — the payload shapes,
validation rules, and what gets written are different enough (sessions/sets vs. exercise targets)
that a shared abstraction would cost more than the ~30 lines of overlap it'd save, and this
codebase's established style (see `AGENTS.md`) is to favor duplication over a speculative shared
layer for two call sites. What *is* shared is the **pattern** (envelope/confirm/preview) and,
per §5, the frontend review-screen component.

## 3. #30 Import — design

### 3.1 Endpoint

`POST /api/import/sessions` — **additive**, separate from the existing `/api/import`
(`backend/main.py:1123`), which stays exactly what it is today: a full-envelope disaster-recovery
replace. Reusing it here was explicitly ruled out by the issue itself ("must not be repurposed").

```python
class ImportSetIn(BaseModel):
    id: Optional[int] = None  # present + existing -> update; absent/unknown -> insert
    exercise_id: str = Field(max_length=64)
    exercise_name: str = Field(max_length=128)
    set_number: int = Field(ge=1)
    reps: int = Field(ge=1)
    weight_kg: float = Field(ge=0, le=1000)

class ImportSessionIn(BaseModel):
    id: Optional[int] = None
    date: str
    workout_day: Literal["upper_a", "lower_a", "upper_b", "lower_b"]
    sets: list[ImportSetIn]

class ImportSessionsIn(BaseModel):
    envelope: dict  # {"schema": "workout-tracker/import-session/v1", "sessions": [...]}
    confirm: bool = False
```

### 3.2 Overwrite semantics (per DECISIONS.md 30.3)

For each session in the envelope, scoped to the acting profile via `acting_profile_id(conn)`
(`backend/main.py:63`) — the seam #86 switches to a real session lookup, so nothing here changes
when it does:
- `id` present **and** it names an existing session owned by this profile → `UPDATE` its
  `date`/`workout_day`.
- Otherwise → `INSERT` a new session.

Same rule per nested set, scoped to its (now-resolved) session id. A set naming an `id` that
belongs to a *different* session or a *different* profile is rejected (400) rather than silently
reassigned — this is the one place "add-only by default" isn't enough on its own; without this
check a malformed or malicious envelope could overwrite another profile's row by guessing an id.

### 3.3 Units — offloaded to the AI, not app code

Per DECISIONS.md, this repo stores `weight_kg` only, no unit field, no conversion path anywhere
(matching the personal-bests precedent). Rather than add lb→kg logic to validate/convert on the way
in, the prompt template (§3.4) explicitly instructs the AI: *"All weights must be output in
kilograms. Convert any pound values in the source notes before writing the JSON (1 lb = 0.453592
kg), rounded to one decimal place."* The app's schema only ever accepts `weight_kg` — there's no
unit field for the AI to (mis)report through in the first place.

### 3.4 Prompt template

Static text, served alongside the schema (e.g. `GET /api/import/prompt-template`, or simply
embedded as a frontend constant — a plan-time call, not fixed here) telling the AI: read the user's
pasted notes, emit *only* JSON matching the `ImportSessionsIn.envelope` shape above, one entry per
distinct session found, `workout_day` must be one of the four literals (best-guess mapping, flagged
in a comment if ambiguous — the review screen is where a human catches a wrong guess), omit `id`
entirely for anything not already known to be a prior import.

### 3.5 Idempotency (per DECISIONS.md 30.2)

None built. Importing the same notes twice creates duplicate sessions — an accepted, documented POC
limitation, not a bug to fix here. (Upsert-by-id, §3.2, is a *different* mechanism — it only fires
when the AI's JSON explicitly names an id it was told about, not automatic duplicate detection.)

## 4. #32 Adaptive coaching — design

### 4.1 Export endpoint

`GET /api/coaching/export?phase=before|after` — `phase` controls what's included (`before`: recent
history + current targets, no "today" data yet since no session has started; `after`: same plus the
just-completed session). Returns:

```json
{
  "schema": "workout-tracker/coaching-export/v1",
  "phase": "before",
  "recent_sessions": ["... last N completed sessions with their sets, mirroring /api/export's shape ..."],
  "current_targets": ["... existing exercise_targets rows, §4.3, if any ..."],
  "prompt_template": "<fixed text, see §4.2>"
}
```

Scoped to the acting profile via `acting_profile_id(conn)`, same caveat as #30 until #86 lands.

### 4.2 The recovery-science constraint is structural, not requested

Per DECISIONS.md 32.5, `docs/superpowers/research/2026-08-16-recovery-science.md` §7's "no recovery
percentages, no 'readiness' language" must hold. The app cannot control what a human pastes into an
external AI conversation, so "ask nicely in the prompt" is necessary but not sufficient — the
stronger lever is the **response schema itself has no field for that kind of output** (§4.3: a
target weight, a target rep count, and a short free-text note — nothing shaped like a percentage or
a readiness score). The prompt template's own instructions reinforce it explicitly: *"Do not
express recovery or readiness as a percentage or score. Do not fabricate data not present in the
export. If you're not confident an exercise needs a change, omit it rather than guessing."*

### 4.3 Apply-update endpoint and the `exercise_targets` table

New table (own migration, sequenced after #66 lands — not part of #66's own migration, since this
is a distinct, later-shipping issue):

```sql
CREATE TABLE exercise_targets (
    profile_id       INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id      TEXT NOT NULL,
    target_weight_kg REAL,
    target_reps      INTEGER,
    note             TEXT,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (profile_id, exercise_id)
)
```

`POST /api/coaching/apply-update`, same `{"envelope": {...}, "confirm": bool}` shape as §3.1:

```json
{
  "schema": "workout-tracker/coaching-update/v1",
  "target_updates": [
    {"exercise_id": "bench_press", "target_weight_kg": 105.0, "target_reps": 5, "note": "add 2.5kg, hold reps"}
  ],
  "general_note": "Consider a deload next week — volume has climbed three weeks running."
}
```

`target_updates` upsert into `exercise_targets` (`ON CONFLICT(profile_id, exercise_id) DO UPDATE`)
on confirm. `general_note` is shown on the confirm screen for context and **not persisted** —
keeping v1 to the smallest slice that's still useful (a durable per-exercise target plus a
one-time, disposable note reads as complete; a running log of general notes is a plausible v2, not
designed here).

### 4.4 Minimal read surface

Without somewhere to see a confirmed target, the whole loop would be invisible after the confirm
click. v1 needs `GET /api/coaching/targets` (list the acting profile's current rows) and *some*
display of them — exactly where (a Progress page section, a dedicated small view) is a plan-time UI
call, not fixed here. Explicitly out of scope for this spec: wiring these targets into
`Workout.jsx`'s live prefill logic (`prefillFor`, per the personal-bests plan's Task 7 precedent for
how that would even work) — that's a natural, separate follow-up issue once targets exist and prove
useful, not something to build speculatively now.

### 4.5 Deferred to v2, not designed here

Live API integration (DECISIONS.md 32.1's option (b)): who owns API cost, rate limiting/circuit
breaking, and "a failed call must never block set logging" (the issue's own Q7) all need answers,
but only once (b) is actually being scoped — premature to design against an API call this v1
doesn't make.

## 5. Frontend: shared review-screen shape

Both flows need "paste JSON → parse → human-readable preview → Confirm/Cancel." Not a shared
component mandate at spec level (that's a plan-time call once real UI work starts), but both should
render the *same kind* of preview: plain counts and a short list, not a raw JSON dump — e.g. import
shows "3 new sessions, 1 updated, 14 sets, spanning 2026-06-01 to 2026-06-15"; coaching shows the
`target_updates` as a small table (exercise, current → proposed) plus the `general_note` text. A
failed validation shows the specific error (which field, which entry), not a generic "invalid
JSON" — matching `/api/import`'s existing precedent of specific 400 messages
(`backend/main.py:1125-1134`).

## 6. Testing

Backend, per endpoint: schema validation rejects malformed/out-of-range fields with a specific
message; `confirm: false` writes nothing and returns an accurate preview; `confirm: true` writes
exactly what the preview promised; a set/session `id` naming another profile's row is rejected, not
silently reassigned (import only); re-running an identical import creates duplicates, confirming
§3.5's accepted POC behavior rather than silently starting to dedupe later without a test noticing;
`exercise_targets` upsert on a repeat `exercise_id` updates in place rather than duplicating.

Frontend: the review screen renders the preview shape correctly for both a clean and a
partially-invalid envelope; Confirm is disabled until a successful parse.

## 7. Sequencing / next step

Once skimmed by the owner: split into `ready` child issues the same way #29 → #66/#67/#68/#69 was
split (this doc plays the same role #29's closing comment + DECISIONS.md played there). Suggested
split: one child per endpoint pair (import; coaching export+apply+targets-read), each `blocked-by`
#86. Not splitting here — that's the next `/orchestrate` action on these issues, not this
document's job.
