# Manual historical Personal Bests — design

**Date:** 2026-08-17
**Status:** Design approved by owner in chat 2026-08-17. Not yet built.
**Research:** [`../research/2026-08-17-personal-bests-import-analysis.md`](../research/2026-08-17-personal-bests-import-analysis.md)
**Supersedes:** nothing shipped. This is a narrower slice of the "C — import + AI
prompt" workstream in
[`../../../.claude/handoffs/2026-08-17-next-workstreams.md`](../../../.claude/handoffs/2026-08-17-next-workstreams.md) —
manual entry only, no AI/notes parsing, and deliberately pulled ahead of
workstreams D (design-system) and B (profiles).

---

## Problem

The app only knows about lifts performed since you started using it. There is
no way to record a personal best you already hold from training before the
app existed — a 2023 bench max, a squat PR from a meet — so the app's "PR to
beat" is wrong (too low) for anyone with training history, and the
muscle-recovery/progress picture starts from zero instead of from where you
actually are.

## Scope

**In:** a manual entry form for a historical PB (exercise, weight, reps, a
rough date), a dedicated list view for browsing/deleting them, and having
today's actual workout treat a historical PB as the bar to beat (live "🏆 PR!"
toast, weight prefill, and the Finish-summary PR/baseline comparison).

**Out:** AI/notes-based bulk import of PBs (a separate, larger workstream —
"C" in the handoff — that this may later feed into, but is not this spec).
Editing an existing entry (delete-and-re-add covers corrections for now).
Unit conversion (kg only, matching the rest of the app). Blending PBs into
the Progress page's chart or its chart-derived "Personal Record" badge, or
into the session-volume PR (deliberately excluded — see "Decisions" below).
Any accommodation for the not-yet-designed profiles feature ("B") beyond a
note for that design to inherit — see "Note for the profiles design" below.

---

## 1. Decisions made in brainstorming (2026-08-17)

The research at
[`2026-08-17-personal-bests-import-analysis.md`](../research/2026-08-17-personal-bests-import-analysis.md)
deliberately left four questions open (§10) for the owner to answer. Answers,
from the chat:

| Question | Decision |
|---|---|
| Where do PBs show up? | A dedicated "Personal Bests" view, not blended into History or the Progress chart. |
| Does today's workout compare against them? | Yes — they count as the bar to beat for the live PR toast, the weight prefill, and the Finish-summary PR/baseline logic. |
| Weight only, or weight + reps? | Weight + reps — lets a PB participate in the reps and 1RM comparisons, not just weight. |
| Unknown dates? | Not left blank — a rough date (year) is required; a free-text note can add texture ("Fall", "gym PR meet"). |
| Profile placeholder? | No. Explicitly deferred — see below. |

These answers select research approach **(b), a separate `personal_bests`
table** — the only approach whose default behaviour matches "excluded from
History/session-counters/recovery model by construction" *and* whose PR
integration is an explicit, scoped choice rather than an all-or-nothing
side-effect of reusing the `sessions`/`sets` machinery (research §9's
comparison table).

**One deviation from a pure approach (b):** the research's version of (b)
would fold PBs into `all_progress`/`/api/progress` to feed the live-toast/
prefill map (§6.1 point 3). This spec does not — see §3.2.

## 2. Data model

New table, added in `_migrate` as the `v < 3` block (`backend/main.py:64` is
the current last block), bumping `PRAGMA user_version` to 3:

```sql
CREATE TABLE personal_bests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id    TEXT NOT NULL,
    exercise_name  TEXT NOT NULL,
    weight_kg      REAL NOT NULL,
    reps           INTEGER NOT NULL,
    achieved_year  INTEGER NOT NULL,
    achieved_note  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(exercise_id, weight_kg, reps, achieved_year)
)
```

- `exercise_id`/`exercise_name` are chosen from the same static catalog in
  `frontend/src/data/workoutPlan.js` that every other exercise picker in the
  app uses (see §4) — not free text — so the id→name pairing can never drift,
  which is what causes the two-chips bug in `all_progress`'s
  `GROUP BY exercise_id, exercise_name` (research §1.4).
- `UNIQUE(exercise_id, weight_kg, reps, achieved_year)` gives idempotency for
  free (research §8): resubmitting the same PB is a constraint violation, not
  a silent duplicate. It also means one exercise can hold multiple PB rows
  (different rep ranges/years), which is intended — the view lists all of
  them, not just one "best."
- `achieved_year`: `Field(ge=1900)`, and validated server-side as `<=
  datetime.now().year` (not a static upper bound, since "current year" moves).
- `weight_kg`/`reps`/`exercise_name` reuse the same bounds as `SetIn` today
  (`backend/main.py:105`ish: `weight_kg: Field(ge=0, le=1000)`,
  `exercise_name` capped at 128 chars) for consistency.

Add to the existing generic machinery:

```python
TABLES = ["sessions", "sets", "exercise_notes", "events", "personal_bests"]
TABLE_INTRODUCED_AT = {"sessions": 0, "sets": 0, "exercise_notes": 0,
                        "events": 2, "personal_bests": 3}
```

Because `/api/export` and `/api/import` are already fully generic over
`TABLES` (`backend/main.py:407`, `:446-455`) and the envelope-version gate
already exists (`backend/main.py:424`, landed in `adbf3f5`), this is the
entire export/import change. Every existing backup — nightly Drive uploads,
pre-deploy snapshots — stays importable with no `personal_bests` key, exactly
per the gate's design.

## 3. Backend

### 3.1 Endpoints

- `POST /api/personal-bests` — body `{exercise_id, exercise_name, weight_kg,
  reps, achieved_year, achieved_note?}`, inserts, returns the row with its
  new `id`. A `UNIQUE` violation returns 409.
- `GET /api/personal-bests` — returns all rows, `ORDER BY exercise_name,
  weight_kg DESC`.
- `DELETE /api/personal-bests/{id}` — removes the row if it exists, returns
  `{"deleted": True}` unconditionally, matching the existing convention at
  `DELETE /api/sessions/{sid}` and `DELETE /api/sessions/{sid}/sets/{set_id}`
  (`backend/main.py:196-202`, `:216-221` — neither checks for prior
  existence). No edit endpoint (YAGNI — delete-and-re-add covers corrections;
  add one later only if that proves annoying in practice).

### 3.2 PR-detection integration

**`session_prs`** (`backend/main.py:339-371`, the Finish-summary comparison):
after the existing `prior` query (`:342-344`), union in personal-bests rows
with matching column names so they fall into the same per-exercise list:

```python
pb_rows = conn.execute(
    "SELECT exercise_id, weight_kg, reps FROM personal_bests").fetchall()
prior = list(prior) + list(pb_rows)
```

Everything downstream — the `psets` filter (`:355`), the weight/reps/1RM
comparisons (`:360-370`), and the baseline suppression (`:357-359`, `if not
psets`) — needs no further change. A PB now counts as prior history, so the
first in-app session for that exercise stops emitting `baseline` and is
judged as a real PR/no-PR against the PB, matching the decision in §1. This
is a deliberate, acknowledged repeat of the behavioural shift the research
flagged in §2 of the source analysis: the 2026-06-30 baseline rule's
principle ("no prior value = baseline") now also treats a manually-logged PB
as a prior value, which is the whole point of this feature.

**`all_progress`/`/api/progress`** (`backend/main.py:240-253`) is
**deliberately left untouched.** That endpoint is the *shared* data source
for two different consumers: the Progress page's exercise-chip picker
(`frontend/src/pages/Progress.jsx:28`) and, incidentally,
`Workout.jsx`'s live-PR-toast/prefill seed
(`frontend/src/pages/Workout.jsx:123-130`). Folding PB maxes into it would
leak PB-only exercises into the Progress picker as chips whose charts are
permanently empty — directly contradicting the "dedicated view, not blended
into the chart" decision. Instead:

`Workout.jsx` fetches `/api/personal-bests` as a second call alongside its
existing `/api/progress` fetch, builds a `pbMaxByExercise` map (max
`weight_kg` per `exercise_id`), and merges it into `prsAtStart`/`prs` at
mount: `Math.max(sessionMax ?? -Infinity, pbMax ?? -Infinity)`. This gets the
live "🏆 PR!" toast and `prefillFor`'s fallback weight
(`frontend/src/lib/workoutFlow.js:18-19`) both accounting for historical PBs,
without touching `/api/progress` or anything that reads it.

**Volume PRs** (`backend/main.py:341, 367-370`) are untouched — a PB has no
session to sum a volume over, so it cannot participate, and none of the
decisions in §1 asked for it to.

**`get_progress`, `exercises_recency`, `last_performance`** — untouched.
None of them are in scope per the "dedicated view" decision, and none read
`personal_bests` at all.

### 3.3 Accepted inconsistency

Because the Progress page's "Personal Record" badge
(`frontend/src/pages/Progress.jsx:42`, `Math.max` over chart points) stays
chart-derived and PBs are excluded from the chart by design, that badge can
show a lower number than what `Workout.jsx` now enforces as the live bar to
beat. E.g. Progress badge shows 90kg (best logged session) while the workout
page prefills 100kg (historical PB). This is an accepted, explicit trade-off
of "dedicated view" (§1), not a defect to fix in this spec.

## 4. Frontend

- New route `/personal-bests` in `frontend/src/App.jsx`, reached via a link
  in the Progress page header (`frontend/src/pages/Progress.jsx`) — not a new
  NavBar tab. `NavBar.jsx` has hand-tuned 44px tap targets that are explicitly
  in scope for the pending design-system decision ("D"); adding a fourth tab
  ahead of that decision is exactly the kind of screen change this feature was
  pulled ahead of D to avoid entangling with.
- `frontend/src/data/workoutPlan.js` gains a small export — a flattened,
  de-duplicated `{id, name}` list across every exercise in `PLAN`, computed
  once — so the entry form's exercise picker can offer *every* exercise, not
  only ones with existing session history (which is what `/api/progress`'s
  chip list is limited to).
- New page `PersonalBests.jsx`: a form (exercise picker, weight in kg, reps,
  year, optional note) above a list of existing entries grouped by exercise,
  each with a delete action. Reuses the existing `.card`/`.tap-target`
  utility classes and inline-`style={{}}` conventions used throughout the
  app — no new styling approach, per the standing constraint ahead of "D".
- `Workout.jsx` gains the merge described in §3.2.

## 5. Note for the profiles design ("B")

No placeholder column is added now — the profiles research leaves open
whether a profile *owns* data (partitioned rows, needs a real FK) or is
*just a label* (no partitioning), and a column guessed today would very
likely be the wrong shape for whichever answer that brainstorm lands on. See
chat discussion 2026-08-17: adding it now would pre-empt a decision the
handoff explicitly reserved for the user.

One concrete thing for that design to inherit: `personal_bests` has a
`UNIQUE(exercise_id, weight_kg, reps, achieved_year)` constraint. SQLite
cannot `ALTER` a `UNIQUE` constraint in place — so if "B" ends up partitioning
by profile, widening this constraint to include a `profile_id` will need a
table rebuild, the same class of migration `exercise_notes` already needs for
its PK-on-`exercise_id` (per the profiles research). Not a blocker for this
spec; just a fact the B brainstorm should have on hand rather than discover.

## 6. Testing

TDD applies throughout (`superpowers:test-driven-development`).

**Backend (`backend/test_*.py`):**
- Migration: fresh DB reaches `user_version = 3` and has a `personal_bests`
  table; an existing v2 DB migrates forward without touching existing data.
- `POST /api/personal-bests`: valid insert returns the row with an `id`;
  out-of-range `weight_kg`/`achieved_year` (future year) is rejected; a
  duplicate `(exercise_id, weight_kg, reps, achieved_year)` returns 409.
- `GET /api/personal-bests`: returns inserted rows, ordered as specified.
- `DELETE /api/personal-bests/{id}`: removes the row; deleting a
  non-existent id still returns `{"deleted": True}` (matches the existing
  unconditional-delete convention).
- `session_prs`: a PB with no in-app session history suppresses the
  `baseline` marker for that exercise (replacing it with a real weight/reps/
  1RM comparison); a session that doesn't beat the PB gets no PR entry for
  that metric; a session that does beat it gets one. Extends the existing
  baseline-rule tests (research references `backend/test_main.py:36-43`).
- `/api/export`: envelope's `tables` dict includes `personal_bests`;
  `schema_version` is 3. Updates the two assertions the research flagged as
  breaking (`backend/test_foundations.py:88-89`).
- `/api/import`: an old envelope (`schema_version: 2`, no `personal_bests`
  key) still imports successfully — the regression test for the
  already-hardened envelope gate, now exercised by a real new table instead
  of a synthetic one.

**Frontend (`frontend/src/**/*.test.jsx`):**
- `PersonalBests.jsx`: submitting the form calls the API and the new entry
  appears in the list; delete removes it from the list.
- `Workout.jsx`: the live PR toast fires only above `max(session best, PB)`,
  and `prefillFor` uses that same max when no in-app history exists — mocking
  `/api/personal-bests` to isolate this from the existing `/api/progress`
  tests.

## 7. Deploy

This is a schema migration. Per `AGENTS.md`, a pre-deploy `/api/export`
snapshot is mandatory and a restore drill is required afterward (last drill
2026-07-09).
