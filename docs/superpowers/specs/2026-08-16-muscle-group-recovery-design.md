# Muscle-Group Selection + Recovery Estimate — Design

**Date:** 2026-08-16
**Status:** Design approved decision-by-decision in brainstorming; awaiting spec review.
**Research basis:** [`docs/superpowers/research/2026-08-16-recovery-science.md`](../research/2026-08-16-recovery-science.md)

---

## 1. Goal

Give the Home screen a second way in: pick a **muscle group** instead of accepting the
next day in the 4-day cycle, and see **how long it has been** since each group was
trained, with an animated estimate of how far its stimulus has decayed.

The 4-day Upper/Lower cycle stays the default. The picker is an alternative entry
point, not a replacement.

### Out of scope

| Deferred | Why |
|---|---|
| Nutrition (pre/post food, protein & vitamin timing) | Its own spec later. Bodyweight input becomes worth revisiting *only* if that project happens — ISSN protein targets are g/kg. |
| Ad-hoc / custom session building | User chose "recommend the best plan day" instead. Keeps the schema untouched. |
| Logging outside workouts (classes, cardio) | User: *"i also do small workout classes that it wont know, so let's keep it simple."* See §8. |
| Biometrics (height, weight, age) | Not an input to the model. Would add a personal-data surface to an app on a public repo reachable over the tailnet, for zero accuracy gain. |

---

## 2. What the evidence permits

The full review is in the research doc. Four findings drive this design:

- **Time since stimulus, scaled by how much stimulus there was, is the only honest
  signal in a training log.** Everything past that is inference the data cannot support.
- **Recovery time tracks movement pattern, not muscle size.** Dourado et al. (2023)
  compared knee extension against leg press *in the same subjects, on the same muscle*:
  24 h vs 48 h to recover peak torque, 48 h vs 96 h for edema. Nothing supports "small
  muscles recover faster."
- **Indirect sets count as 0.5.** Pelland et al. (2025), Bayesian meta-regression over
  67 studies — this is the one number in the model with a meta-regression behind it.
- **Do not show a percentage.** Carmona et al. (2018): identical protocol, 21% vs 52%
  MVC loss between subjects, >10× CK spread. None of the factors explaining that spread
  are in our data. `62%` reads as an instrument reading and isn't one.

Commercial recovery scores (WHOOP, Oura, Garmin) composite HRV, resting heart rate,
sleep staging and skin temperature against a personal baseline. **We have none of those
inputs**, and several of those products feed training load back in — so a low score can
mean "you trained hard" rather than "you recovered badly." A log-only model reproduces
that circularity without even the physiological correction. The defensibility here lies
entirely in the labelling.

---

## 3. Muscle taxonomy — `frontend/src/lib/muscles.js`

### 3.1 Why a new module

The `muscles:` arrays in `frontend/src/data/workoutPlan.js` are exercise-level form
copy, not a taxonomy. 22 exercises carry 22 distinct raw tags at inconsistent
granularity: `Chest` and `Upper Chest` but no unified chest; `Gastrocnemius` and
`Soleus` but no `Calves`; six separate back tags but no `Back`. Grouping by raw tag
would produce 22 chips, several of which no user thinks in.

The plan data stays untouched. The new module maps it.

### 3.2 The seven display groups

Legs split into three because the plan's own `tag` strings already draw those lines
(`Quad · Hamstring · Calves`).

| Group id | Label | Raw tags |
|---|---|---|
| `chest` | Chest | `Chest`, `Upper Chest` |
| `back` | Back | `Lats`, `Mid Back`, `Rhomboids`, `Traps`, `Spinal Erectors`, `Lower Back` |
| `shoulders` | Shoulders | `Front Delt`, `Side Delt`, `Rear Delt` |
| `arms` | Arms | `Biceps`, `Triceps`, `Triceps (Long Head)`, `Brachialis`, `Forearms` |
| `quads` | Quads | `Quads`, `Hip Flexors` |
| `posterior` | Hamstrings & Glutes | `Hamstrings`, `Glutes` |
| `calves` | Calves | `Gastrocnemius`, `Soleus` |

All 22 raw tags are covered exactly once. A test asserts this both ways (§10).

### 3.3 Fractional set weighting

**Two tiers: direct ×1.0, indirect ×0.5.** Not three. An earlier 1.0/0.5/0.25 sketch was
dropped — Pelland et al. found indirect-as-0.5 best predicts adaptation, and there is no
evidence supporting a third tier.

All 22 exercises were checked and each already lists its **primary muscle first**, so the
rule is positional:

```
weight(exercise, tagIndex) = tagIndex === 0 ? 1.0 : 0.5
```

with a small `DIRECT_TAG_OVERRIDES` map for exceptions. The map is empty at ship time —
it exists so a future plan edit that breaks the positional assumption is a one-line fix
rather than a rewrite. A test asserts every exercise's tag 0 is its genuine primary.

An exercise contributes to a group once per *group*, not once per raw tag: `cable_row`
lists `Mid Back`, `Rhomboids`, `Lats` — all `back`. Its contribution to `back` is
`max` over its tags in that group (1.0 here, from `Mid Back` at index 0), **not** the
sum. Summing would triple-count a single rowing movement.

### 3.4 Recovery time constants (τ)

Keyed to movement pattern. Covers all 22 exercises.

| Pattern | τ | ≈90% decay | Exercises |
|---|---|---|---|
| `isolation` | 12 h | ~28 h | `tricep_pushdown`, `db_curl`, `hammer_curl`, `skull_crusher`, `lateral_raise`, `leg_curl`, `leg_ext`, `standing_calf`, `seated_calf` |
| `compound_upper` | 18 h | ~41 h | `bench_press`, `incline_press`, `ohp`, `bent_row`, `cable_row`, `lat_pulldown`, `pullup` |
| `compound_lower` | 24 h | ~55 h | `back_squat`, `deadlift`, `rdl`, `leg_press`, `bss`, `hip_thrust` |

12 h and 24 h anchor to Dourado's measured 24 h / 48 h recovery points. **18 h is
interpolated and is the weakest link in the model** — no study measures multi-joint
upper-body recovery directly. The spec records that rather than hiding it.

A test asserts every exercise id in `PLAN` has a pattern, so adding an exercise without
classifying it fails CI rather than silently defaulting.

### 3.5 `bestDayForMuscle(groupId, lastTrainedByDay)`

Scores each of the 4 plan days by total fractional sets for that group, highest wins.
`lastTrainedByDay` maps each day id to the `date` of its most recent completed session
(or `null`); it is used only for the tie-break below, which is why this function takes
dates rather than freshness — the taxonomy module does no time arithmetic.

Tie-break, in order:
1. **More rested day wins** — the day whose most recent completed session is older.
   A never-trained day counts as infinitely old. This couples the picker to the
   recovery work, which is the point.
2. `CYCLE` order (`upper_a`, `lower_a`, `upper_b`, `lower_b`) as the final
   deterministic fallback.

The tie is real, not hypothetical: `chest` scores 3.0 in both `upper_a` (bench, 3 sets
direct) and `upper_b` (incline press, 3 sets direct on `Upper Chest`).

### 3.6 Consequence the user accepted

Because the picker starts a *real* plan day, the 4-day cycle advances from it —
`getNextWorkoutId` reads the last session's `workout_day` and moves on. There is no
"ad-hoc" session to exclude from the cycle. This was put to the user and accepted.

---

## 4. The recovery model — `frontend/src/lib/recovery.js`

### 4.1 Formula

Per exercise bout (the most recent time that exercise was trained):

```
term  = min(1, fractionalSets / 6) × novelty × exp(−hoursSince / τ)
```

Per group:

```
load      = min(1, Σ terms over the group's exercises)
freshness = 1 − load
```

- `ref = 6` fractional sets — a session at or above this is one full stimulus unit.
- `novelty = 1.5` if the exercise had no prior occurrence, or none within 28 days before
  that bout (repeated-bout effect); otherwise `1.0`.
- **Nothing is fitted and there are no per-user parameters.** There is no ground truth
  to fit against, so a fitted model would only be more confident, not more correct.

### 4.2 Two deliberate deviations from the research doc's formula

1. **The cap is applied per exercise bout, then again to the group total.** The paper's
   form applies `min(1, sets/6)` per *session*. Our τ varies per exercise, so a session
   can't be one term. Per-exercise capping is the more conservative of the two
   (`min(1,a/6) + min(1,b/6) ≥ min(1,(a+b)/6)`) and the group-level cap of 1.0 bounds it
   either way.
2. **Only the most recent bout of each exercise is summed.** With τ ≤ 24 h, a bout two
   sessions back (≈96 h on this split) contributes ≤1.8% — below the resolution of a
   three-band display. This keeps `GET /api/exercises/recency` to one row per exercise.

### 4.3 Band thresholds

| Freshness | Band label |
|---|---|
| ≥ 0.75 | `Fresh` |
| 0.35 – 0.75 | `Partly recovered (est.)` |
| < 0.35 | `Recently trained` |

Never-trained groups get their own state: `Not trained yet`.

Sanity check against the evidence — quads after Lower A (`back_squat` 3 direct +
`leg_press` 3 direct = 6 fractional sets, τ = 24 h, both exercises familiar so
`novelty = 1.0`):

| Elapsed | Load | Freshness | Band |
|---|---|---|---|
| 0 h | 1.00 | 0.00 | Recently trained |
| 24 h | 0.37 | 0.63 | Partly recovered (est.) |
| 48 h | 0.14 | 0.86 | Fresh |

Fresh at 48 h is exactly Dourado's multi-joint recovery point. That agreement is a
consequence of the τ choice, not a coincidence — but it is the right sanity check to
keep in the test suite.

With `novelty = 1.5` (first-ever session) the same group reads 0.45 at 24 h and 0.80 at
48 h — still Partly recovered then Fresh, one band later in wall-clock terms. Both rows
belong in the tests.

### 4.4 What "last trained" means for a group

A group's day-count and raw-fact line use the **most recent bout among all exercises
that contribute any nonzero weight to that group** — indirect contributions count. Bench
press therefore counts as having trained `arms` (triceps, ×0.5), which is true and is
what the freshness ring already reflects. The raw-fact line reports the hours since that
bout and the group's total fractional sets **on that bout's calendar date**, so a day
that hit quads from two exercises reports both.

### 4.5 Timezone handling — a real bug waiting to happen

`backend/main.py:154` writes `sessions.date` from `datetime.now()` — **server-local** —
while `created_at`, `logged_at` and `ts` all use SQLite `datetime('now')` — **UTC**.
On a BST Pi these disagree by a day around midnight.

The rule, and it is not negotiable:

- **Day counting uses `date`** against the client's local today. "3 days ago" is a
  human calendar statement, and `date` is the only field recorded in the user's own
  local frame.
- **Hour counting uses `logged_at`**, parsed as UTC. `frontend/src/pages/History.jsx:9`
  already establishes the parse idiom: `Date.parse(s.replace(' ', 'T') + 'Z')`. Reuse it
  rather than inventing a second one.

Day counts are computed by comparing calendar dates, not by dividing an hour delta by
24 — otherwise "yesterday evening → this morning" reads as 0 days.

### 4.6 Edge states

| Condition | Displayed |
|---|---|
| No sessions at all | Overall line: `No workouts logged yet` |
| Group never trained | Chip: `Not trained yet`, empty ring |
| Last trained today | `Today` |
| Last trained 1 day ago | `Yesterday` |
| Otherwise | `N days ago` |
| Clock skew (`last_at` in the future) | Clamp `hoursSince` to 0; never render a negative age |

---

## 5. Backend — `GET /api/exercises/recency`

The only backend change. Additive, read-only, no schema change, **no migration, no
restore re-drill.**

### 5.1 Why a new endpoint

| Existing | Why it doesn't work |
|---|---|
| `GET /api/sessions` | Session rows only — no exercise detail, so it can't tell a completed Upper A from one where the curls were skipped. |
| `GET /api/progress` (`main.py:235`) | Has max weight per exercise but **no date**. |
| `GET /api/exercises/{id}/last` (`main.py:273`) | Has the date, but one exercise per call — 22 requests on Home load. Unacceptable on a Pi 3 B+ over gym wifi. |

The rejected alternative — inferring muscles from `workout_day` alone — is wrong
whenever a session is partially completed, and this app deliberately supports
abandoning and resuming sessions, so partial sessions are real data.

### 5.2 Response shape

One row per exercise that has ever been logged in a completed session:

```json
[
  {
    "exercise_id": "bench_press",
    "last_date": "2026-08-12",
    "last_at": "2026-08-12 18:04:11",
    "sets": 3,
    "volume_kg": 1680.0,
    "prev_date": "2026-08-05"
  }
]
```

- `last_date` — `sessions.date` of the most recent completed session containing this
  exercise. Server-local, used for day counting.
- `last_at` — `MAX(sets.logged_at)` within that session for this exercise. UTC, used for
  hour counting. Per-set rather than per-session because a partially completed session's
  sets are logged over a real span of time.
- `sets` — count of logged sets in that session (actual, not planned).
- `volume_kg` — `SUM(weight_kg × reps)`. Not used by the model; included because it is
  free in the same query and is the natural thing the next feature will want.
- `prev_date` — `sessions.date` of the *second* most recent completed session containing
  this exercise, or `null`. **This field exists solely to compute `novelty`**: the bout
  is novel if `prev_date` is null or `last_date − prev_date ≥ 28 days`.

### 5.3 Completed-sessions-only, and what that costs

The query filters `s.completed = 1`, matching the existing convention in `get_progress`
and `all_progress`.

The cost, stated plainly: sets logged in a session that was **abandoned** rather than
completed do not count toward load. The model therefore reads that muscle as fresher
than it is. This is the same direction of error as §8 and is accepted for consistency
with the rest of the app.

### 5.4 Implementation notes

One SQL statement, no fan-out. The existing `idx_sets_exercise` and `idx_sets_session`
indexes (migration v2) cover it. Follow the module's existing style: `with db() as
conn:`, `sqlite3.Row`, return plain dicts.

Empty database returns `[]`, not an error.

---

## 6. Frontend — modules and boundaries

Three new files, each independently testable, none importing the others' internals.

| File | Responsibility | Depends on |
|---|---|---|
| `frontend/src/lib/muscles.js` | Static taxonomy. Raw tag → group, direct/indirect weights, τ per exercise, per-day group set counts, `bestDayForMuscle`. **No time, no network.** | `workoutPlan.js` |
| `frontend/src/lib/recovery.js` | Pure time math. Takes a recency array + a `now` and returns freshness, band, hours-since and day-since per group. **No React, no fetch, injectable clock.** | `muscles.js` |
| `frontend/src/components/MuscleGroupPicker.jsx` | Presentation: the chip grid, the rings, expand-to-detail, the disclosure. | both, `api` |

`Home.jsx` composes them and owns the **one** new fetch (`/api/exercises/recency`). The
`lastTrainedByDay` map that `bestDayForMuscle` needs is derived from the `/api/sessions`
response Home already fetches — no second request. Splitting taxonomy from time math
matters because the taxonomy is data that a plan edit changes, while the model is
arithmetic that research changes — different reasons to edit, different test styles
(table-driven vs. clock-driven).

### 6.1 Home layout

```
NEXT UP
💪 Upper A
Chest · Back Horizontal · Arms
Last workout 3 days ago                    ← new: overall days-since

[ Start Upper A ]

MUSCLE GROUPS                              ← new section
┌──────────┬──────────┬──────────┐
│ ◕ Chest  │ ◐ Back   │ ○ Should │        ring + label + band text
│  Fresh   │ Partly…  │ Recently │
├──────────┼──────────┼──────────┤
│ ◕ Arms   │ ● Quads  │ ◐ Hams   │
│  Fresh   │ Recently │ Partly…  │
├──────────┴──────────┴──────────┤
│ ◕ Calves — Fresh               │
└────────────────────────────────┘

  ▼ tapped: Quads
  Last trained 31h ago · 6 fractional sets
  Best day for Quads → Lower A
  [ Start Lower A ]

Estimated from your logged training only — no sleep or HRV data, and it
doesn't know about classes or training you log elsewhere. Trust how you
feel over this estimate.

LAST SESSION
…
```

The section sits between the Start button and "Last session". The disclosure sits
**inside** the muscle section, at the point of display — not in settings, not behind an
info icon.

### 6.2 Interaction

Tapping a chip **expands it to a detail row with an explicit `Start <Day>` button**; it
does not start a workout on the first tap.

> **Flagged deviation.** The approved decision was "tapping a muscle group … starts that
> day normally." Two taps instead of one, because a single tap posts `/api/sessions` and
> creates a real row — a stray thumb in a gym would leave a phantom session to abandon.
> The expansion also carries the raw-fact line, which the research doc calls the most
> useful thing on screen. Overridable at spec review.

When a session is already active, the chips still render (read-only) but the Start
buttons are replaced by a single line: `Finish your current session first`. Home already
switches its main button to Resume in that state; the picker follows it.

### 6.3 Display rules

- **Continuous ring, band label, never a number.** The ring animates smoothly and
  continuously as freshness changes — that is what makes it animatable, which is what
  the user asked for. The *text* is always one of the four band labels.
- **Do not reintroduce a percentage** unless the user asks again. The band is the honest
  resolution of the model.
- Raw fact underneath, in the expanded row: `Quads — last trained 31h ago, 6 fractional
  sets.` This line is *true*, unlike everything above it. (The research doc's version of
  this example says 14 sets; ours says 6 because that is what Lower A actually
  prescribes.)
- **No red/amber/green semantics.** "Recently trained" is not a warning and must not look
  like one — see §7. Use a single-hue sequential ramp keyed to freshness.
- The band label is text, so colour is never the only channel carrying state.
- Load the `dataviz` skill before writing the ring/meter code. It is installed and is the
  right tool for this; no UI/UX specialist agent exists to consult.

### 6.4 Animation and motion

Ring fill animates via a CSS transition on `stroke-dashoffset`. Respect
`prefers-reduced-motion: reduce` — snap to final value, no transition. On mount the
rings animate from empty to their value once; they do not loop or pulse.

### 6.5 Style constraints

- Inline-style React with the existing utility classes (`.card`, `.btn-primary`,
  `.tap-target`) from `frontend/src/index.css`. **Do not introduce a new styling
  approach.**
- Mobile-first. The 2026-07-10 responsive sweep established **≥44px tap targets and no
  horizontal overflow down to 320px**. Seven chips in a grid must hold that line —
  verify at 320px explicitly.
- Reuse `DAY_COLORS` for the day identity in the expanded row so the picker reads as
  part of the same app.

---

## 7. Guardrails — hard rules

All four selected by the user. These are requirements, not preferences.

1. **No overtraining or injury-risk warnings.** No basis in our data, and potentially
   harmful.
2. **No "you're losing gains" nudges.** Ogasawara found no significant CSA or 1RM loss
   at 3 weeks off; Encarnação et al. rated the evidence below that as insufficient. A
   long gap renders as a neutral fact (`Not trained in 24 days`), never as a prompt.
3. **No "readiness" language.** Readiness is systemic and we have none of its inputs.
   Banned words in UI copy: *readiness, recovered* (bare), *fatigue, overtrained,
   optimal, risk*. "Recovery" appears only inside `Partly recovered (est.)`, where the
   qualifier is doing the work.
4. **The estimate never overrides the user.** The UI says so explicitly, in the
   disclosure text.

Also, from the research doc's caveat list:

- Do not present the MPS curve as a growth curve (Damas 2016: week-1 synthesis tracked
  damage and did **not** correlate with hypertrophy).
- Do not present muscle-*size*-based recovery tiers as established. Ours are
  pattern-based, and §3.4 says so.
- Do not claim individual calibration. There is none.

---

## 8. The blind spot, stated plainly

The user trains at small classes the app will never see.

**Decision: no class-logging feature.** That is the "keep it simple."

But the error this introduces is worth naming precisely, because it is
**one-directional**: unlogged training can only make the model **overstate** freshness,
never understate it. The app will never tell the user a muscle is more tired than it
really is on account of this gap. Combined with the guardrails — no warnings, no
prescriptions — the failure mode is a chip reading `Fresh` when the user knows better,
and §7.4 already tells them who wins that disagreement.

Disclosure text, shown at the point of display:

> *Estimated from your logged training only — no sleep or HRV data, and it doesn't know
> about classes or training you log elsewhere. Trust how you feel over this estimate.*

---

## 9. Latent bug fixed as part of this work

`frontend/src/pages/Workout.jsx:107` dereferences `PLAN[s.workout_day].exercises`
unguarded. Any session whose `workout_day` is not one of the four hardcoded keys throws
a `TypeError` and the page dies.

The current design never produces such a session — the picker resolves to an existing
plan key — but the guard is cheap and the page is the app's core screen. `Home.jsx:9`
already has exactly the right helper (`planForDay`, which falls back to an empty-exercise
placeholder); use it rather than writing a second one.

---

## 10. Testing

TDD applies (`superpowers:test-driven-development`) once implementation starts. Baseline
at the last recorded wave: **42 backend, 62 frontend**.

### Backend — pytest

- Empty DB → `[]`.
- One completed session → one row per exercise, correct `sets`, `volume_kg`, `last_date`,
  `last_at`.
- An **incomplete** session's sets are excluded (the `completed = 1` convention).
- Two completed sessions containing the same exercise → `prev_date` is the older one.
- Single occurrence → `prev_date` is `null`.
- `last_at` is the **max** `logged_at` within the session, not the min.
- A session where only some exercises were logged returns rows only for those exercises.

### Frontend — vitest

**`muscles.js` — structural tests that guard against future plan edits:**
- Every raw tag appearing in `PLAN` maps to exactly one group.
- Every group's tag list contains only tags that appear in `PLAN` (no dead entries).
- Every exercise id in `PLAN` has a τ pattern.
- Each exercise's tag at index 0 is its genuine primary (table-driven against an
  explicit expected list).
- An exercise contributes at most 1.0 to any single group (the `cable_row`
  triple-count case).
- `bestDayForMuscle` returns the highest-scoring day; the chest tie resolves to the more
  rested day; a full tie falls back to `CYCLE` order.

**`recovery.js` — clock-driven, `now` injected:**
- Quads after Lower A: the 0 h / 24 h / 48 h table in §4.3 holds, for both the
  `novelty = 1.0` and `novelty = 1.5` rows.
- Load caps at 1.0 when set counts are large.
- A group's "last trained" picks the most recent bout across the group's exercises,
  including indirect ones (bench press counts as training `arms`).
- `novelty = 1.5` when `prev_date` is null or ≥28 days before `last_date`; `1.0`
  otherwise; boundary at exactly 28 days is asserted explicitly.
- Band boundaries at exactly 0.35 and 0.75.
- Never-trained group → `Not trained yet`, not `Fresh`.
- Day counting is calendar-based: 22:00 yesterday → 08:00 today is `Yesterday`, not
  `Today`.
- `last_at` in the future clamps to 0 h rather than producing freshness > 1.
- Timezone: a `logged_at` string is parsed as UTC, matching `History.jsx:9`.

**Component / page:**
- `Home` renders the overall days-since line, and the empty-state copy with no sessions.
- Chip expands on tap and shows the raw-fact line and a Start button.
- Start button is absent, and the "finish current session first" line present, when a
  session is active.
- The disclosure text is present in the DOM whenever chips render.
- `Workout` renders without throwing when `workout_day` is an unknown key.

Run both suites before claiming completion (`superpowers:verification-before-completion`).

---

## 11. Deployment

Nothing here changes the deployment story, and that is worth stating because it is the
riskiest part of this repo.

- **No schema change → no migration → no restore re-drill required.** The endpoint is a
  new `SELECT`.
- Standard loop from `AGENTS.md`: edit on the Mac → commit & push → **build on the Mac**
  → transfer → `docker compose up -d` on the Pi → verify.
- **Never build on the Pi.** 1 GB of RAM; a Vite build there starves Home Assistant.
- `frontend/src/data/workoutPlan.js` keys and the `Literal` at `backend/main.py:98` must
  stay in sync — there is a comment at `main.py:95` saying exactly this. This design
  changes neither; don't break it.
- Verify `/api/health` reports the new commit and that `homeassistant` is still healthy.

---

## 12. Summary of what gets built

| Change | File | Kind |
|---|---|---|
| Recency endpoint | `backend/main.py` | New route, additive |
| Muscle taxonomy | `frontend/src/lib/muscles.js` | New |
| Recovery model | `frontend/src/lib/recovery.js` | New |
| Chip grid + rings + disclosure | `frontend/src/components/MuscleGroupPicker.jsx` | New |
| Days-since line, picker section, one fetch | `frontend/src/pages/Home.jsx` | Modified |
| Unguarded `PLAN[...]` deref | `frontend/src/pages/Workout.jsx` | Bug fix |
| Tests for all of the above | `*.test.js(x)`, `backend/test_*.py` | New |

No schema change. No new dependency. No new styling approach.
