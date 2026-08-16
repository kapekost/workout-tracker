# Muscle-group picker + recovery estimate — design

**Date:** 2026-08-16
**Status:** Shipped to `main` 2026-08-16, not yet deployed. This remains the
authoritative statement of *why* the feature is shaped this way; the shipped
code is authoritative for *what* it does.
**Research:** [`../research/2026-08-16-recovery-science.md`](../research/2026-08-16-recovery-science.md)
**Execution record:** [`../plans/2026-08-16-muscle-group-recovery.md`](../plans/2026-08-16-muscle-group-recovery.md)

---

## Problem

Home forces the next day in the 4-day cycle (`getNextWorkoutId`, `frontend/src/pages/Home.jsx:53`)
with no way to deviate, and nothing in the app says how long it has been since you trained —
overall or per muscle.

## Scope

**In:** muscle taxonomy, muscle-group picker, days-since (overall + per group), per-group
freshness estimate with animated display.

**Out (deferred to its own spec):** nutrition guidance — pre/post food, protein and vitamin
timing. It shares no code with this work and would double the review surface.

**Also out:** bodyweight/height/age capture. No input to this model uses them; capturing them
would add a personal-data surface to a public repo on a tailnet-reachable Pi for zero accuracy
gain. Revisit exactly one value (bodyweight) if the nutrition project happens, since ISSN
protein guidance is g/kg.

---

## 1. Muscle taxonomy — `frontend/src/lib/muscles.js` (new)

The `muscles:` arrays in `frontend/src/data/workoutPlan.js` are not a usable taxonomy: 22
exercises carry 22 distinct raw tags at inconsistent granularity (`Chest` and `Upper Chest`
but no unified chest; `Gastrocnemius`/`Soleus` but no `Calves`; six back tags but no `Back`).

Seven display groups. Legs splits in two because the plan's own `tag` strings already draw
that line ("Quad · Hamstring · Calves" vs "Posterior Chain · Glutes · Power"):

| Group | Raw tags |
|---|---|
| Chest | `Chest`, `Upper Chest` |
| Back | `Lats`, `Mid Back`, `Rhomboids`, `Traps`, `Spinal Erectors`, `Lower Back` |
| Shoulders | `Front Delt`, `Side Delt`, `Rear Delt` |
| Arms | `Biceps`, `Triceps`, `Triceps (Long Head)`, `Brachialis`, `Forearms` |
| Quads | `Quads`, `Hip Flexors` |
| Hamstrings & Glutes | `Hamstrings`, `Glutes` |
| Calves | `Gastrocnemius`, `Soleus` |

**Fractional sets: direct ×1.0, indirect ×0.5.** Two tiers, not three — Pelland et al. 2025
found indirect-as-0.5 best predicts adaptation. It is the one coefficient here with a
meta-regression behind it.

All 22 exercises were verified to list their primary muscle first, so the rule is positional
(index 0 → direct, rest → indirect) with a small override map for exceptions. This avoids
rewriting all 22 entries.

## 2. Muscle picker

`bestDayForMuscle(groupId)` scores each of the 4 plan days by weighted set count for that
group and returns the winner. Tapping a chip swaps the previewed day and retargets the Start
button; tapping again returns to the cycle default.

`POST /api/sessions { workout_day }` is used **unchanged**, with an existing key. No schema
change, no new session type, no migration, and therefore no restore re-drill
(cf. `AGENTS.md` — "re-drill after any schema change").

- **Chest ties.** Upper A (bench, 3 sets) and Upper B (incline, 3 sets) score identically.
  Break ties toward the **fresher** day, coupling the picker to §4.
- **The cycle advances.** Because the picker starts a real plan day, `getNextWorkoutId`
  correctly moves on from it. There is no ad-hoc session to exclude.
- The 4-day cycle remains the default; the picker is a second way in, not a replacement.

## 3. Days since

An overall line under the Home header, plus a per-group readout on each chip.

**Timezone trap:** `backend/main.py:154` writes `date` from `datetime.now()` (server-**local**)
while `created_at` uses `datetime('now')` (**UTC**). Near midnight on a BST Pi these disagree
by a day. Day counting uses `date` against the client's local today — that is what "3 days ago"
means to a human. `created_at` stays for ordering and durations, as
`frontend/src/pages/History.jsx:9` already does.

States: no sessions → "No workouts logged yet"; same day → "Today"; 1 → "Yesterday".

## 4. Freshness model

```
load      = Σ min(1, fractional_sets / 6) × novelty × exp(−hours_since / τ)
freshness = 1 − min(1, load)
```

`novelty` = 1.5 if the exercise is new or unseen for 4+ weeks (repeated-bout effect), else 1.0.
Reference dose = 6 fractional sets. Summed load capped at 1.0. Nothing fitted, no per-user
parameters — there is no ground truth to fit against.

τ keys off **movement pattern, not muscle size.** Dourado 2023: same subjects, same muscle,
knee extension recovered at 24 h, leg press at 48 h. Nothing supports "small muscles recover
faster".

| Pattern | τ | Exercises |
|---|---|---|
| Isolation | 12 h | `tricep_pushdown`, `db_curl`, `hammer_curl`, `skull_crusher`, `lateral_raise`, `leg_curl`, `leg_ext`, `standing_calf`, `seated_calf` |
| Multi-joint upper | 18 h | `bench_press`, `incline_press`, `ohp`, `bent_row`, `cable_row`, `lat_pulldown`, `pullup` |
| Multi-joint lower | 24 h | `back_squat`, `deadlift`, `rdl`, `leg_press`, `bss`, `hip_thrust` |

All 22 exercises covered.

## 5. Display

**Continuous ring, band label, no number.** The ring animates smoothly as freshness rises.
The text reads `Fresh` / `Partly recovered (est.)` / `Recently trained` — never a numeral.
The true fact goes underneath: *"Quads — last trained 31 h ago, 14 fractional sets."*

A percentage was explicitly considered and rejected. "Recovery: 73%" reads as an instrument
reading; we have none of the inputs WHOOP/Oura build theirs from (HRV, resting HR, sleep
staging, skin temp). Carmona 2018 ran one protocol on 13 people and saw 21% vs 52% strength
loss with a >10× spread in damage markers — none of the explanatory factors are in our data.
**Do not reintroduce a percentage.**

The ring is a **sequential** encoding (freshness is a magnitude), so it is a
single-hue ramp, monotonic in lightness, ending on the app's existing `--mint`.
Not red/amber/green: "Recently trained" is a fact, not a warning. The band label
is the non-colour channel, so colour never carries state alone.

## 6. Guardrails — hard rules

1. No overtraining or injury-risk warnings.
2. No "you're losing gains" nudges. Ogasawara found no significant CSA or 1RM loss at 3 weeks off.
3. No "readiness" language. Readiness is systemic; we have none of its inputs.
4. The estimate never overrides the user.

**Known blind spot:** the user does workout classes the app will never see. No class logging
(deliberate — it would be an input flow they'd skip half the time). The error is
**one-directional**: the model can only ever *overstate* freshness, never understate it, which
is the safer direction. Disclosure at the point of display, not in settings:

> *Estimated from your logged training only — no sleep or HRV data, and it doesn't know about
> classes or training you log elsewhere. Trust how you feel over this estimate.*

## 7. Backend — one additive endpoint

`GET /api/exercises/recency` — one read-only SQL query, completed sessions only
(`s.completed = 1`, matching `get_progress` / `all_progress`):

```json
[{ "exercise_id": "bench_press", "last_date": "2026-08-12",
   "last_at": "2026-08-12 18:04:11", "sets": 3, "volume_kg": 1680 }]
```

Rejected alternatives:
- **Infer from `workout_day`** — zero backend work, but wrong whenever a session is partially
  completed, and the app deliberately supports abandoning/resuming, so partial sessions are real.
- **Widen `/api/sessions`** — inflates a response Home, History and the active-session provider
  all fetch on every load.
- **Per-exercise `/api/exercises/{id}/last`** — 22 requests on Home load; unacceptable on a
  Pi 3 B+ over gym wifi.

## 8. Latent bug fixed en route

`Workout.jsx` did `PLAN[s.workout_day].exercises` unguarded. The throw was caught by the
effect's own `.catch(() => nav('/'))`, which silently bounced the user to Home and left the
render-path "Unknown workout day." fallback unreachable. Fixed in `8ae06b1`.

## 9. Testing

TDD. Backend: pytest for the recency endpoint (empty DB, completed-only filtering, partial
sessions). Frontend: vitest for `muscles.js` (tag coverage — every raw tag maps to exactly one
group), `bestDayForMuscle` (including the chest tie-break), the freshness function (decay
monotonicity, cap at 1.0, novelty multiplier), and day-difference/timezone edges.

Mobile-first: chips and rings hold ≥44 px tap targets and no horizontal overflow at 320 px,
per the 2026-07-10 responsive sweep.

## 10. References

Full citations in the research doc. Load-bearing ones: Dourado 2023 (pattern-based τ),
Pelland 2025 (indirect ×0.5), Carmona 2018 (anti-precision), Phillips 1997 / Damas 2015
(MPS window), Ogasawara (detraining).
