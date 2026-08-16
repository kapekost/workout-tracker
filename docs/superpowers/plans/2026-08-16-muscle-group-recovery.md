# Muscle-Group Picker + Recovery Estimate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a muscle group on Home, see how long since each group was trained, and see an animated estimate of how far each group's training stimulus has decayed.

**Architecture:** One additive read-only backend endpoint (`GET /api/exercises/recency`) feeds two new pure frontend modules — `muscles.js` (static taxonomy: raw tag → display group, direct/indirect weights, τ per exercise) and `recovery.js` (time math: exponential stimulus decay → freshness → band label). A new presentational component renders the chip grid and rings; `Home.jsx` composes them. No schema change, no migration, no new dependency.

**Tech Stack:** Python 3.11 + FastAPI + SQLite (backend, pytest); React 18 + Vite (frontend, vitest + @testing-library/react). Inline-style React with the `.card` / `.btn-primary` / `.tap-target` utility classes from `frontend/src/index.css`.

**Spec:** [`docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md`](../specs/2026-08-16-muscle-group-recovery-design.md) (approved, commit `5333d04`)

## Global Constraints

These apply to **every** task. Copied verbatim from the spec.

**Copy and labelling — hard rules (spec §7):**
- **Never render a percentage or any numeral for freshness.** The ring is continuous; the text is always a band label.
- The four band labels are exactly: `Fresh`, `Partly recovered (est.)`, `Recently trained`, `Not trained yet`.
- **Banned words in UI copy:** *readiness*, *recovered* (bare, unqualified), *fatigue*, *overtrained*, *optimal*, *risk*. "Recovery" appears only inside `Partly recovered (est.)`.
- No overtraining or injury-risk warnings. No "you're losing gains" nudges. A long gap renders as a neutral fact.
- **No red/amber/green semantics.** `Recently trained` is not a warning and must not look like one. Single-hue sequential ramp only.
- The band label is text, so colour is never the only channel carrying state.
- Disclosure text, verbatim, rendered at the point of display (not settings, not behind an icon):
  > Estimated from your logged training only — no sleep or HRV data, and it doesn't know about classes or training you log elsewhere. Trust how you feel over this estimate.

**Model constants (spec §4):**
- `ref` = 6 fractional sets · direct ×1.0, indirect ×0.5 · `novelty` = 1.5 at ≥28 days or never-before-seen, else 1.0.
- τ: `isolation` 12 h, `compound_upper` 18 h, `compound_lower` 24 h.
- Bands: freshness ≥ 0.75 `Fresh`; 0.35 ≤ f < 0.75 `Partly recovered (est.)`; f < 0.35 `Recently trained`.
- Nothing fitted. No per-user parameters.

**Data and time (spec §4.5):**
- Day counting uses `sessions.date` (**server-local**) against the client's local today, compared as calendar dates — never by dividing an hour delta by 24.
- Hour counting uses `sets.logged_at` (**UTC**), parsed with the existing idiom from `frontend/src/pages/History.jsx:9`: `Date.parse(s.replace(' ', 'T') + 'Z')`.
- Backend queries filter `s.completed = 1`, matching `get_progress` / `all_progress`.

**Repo constraints (`AGENTS.md`):**
- No schema change in this work — so no migration and no restore re-drill.
- `frontend/src/data/workoutPlan.js` keys and the `Literal` at `backend/main.py:98` must stay in sync. This work changes neither.
- Mobile-first: ≥44px tap targets, no horizontal overflow down to 320px.
- Inline-style React + existing utility classes. **Do not introduce a new styling approach.**
- **Never build the Docker image on the Pi.** Not needed during implementation; relevant only at deploy.

**Test commands:**
- Backend: `cd backend && python -m pytest -q`
- Frontend: `cd frontend && npm test`

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `backend/main.py` | Add `GET /api/exercises/recency`. Nothing else changes. | Modified |
| `backend/test_recency.py` | Tests for that endpoint. | Create |
| `frontend/src/lib/muscles.js` | Static taxonomy. Raw tag → group, direct/indirect weight, τ per exercise, per-day group set counts, `bestDayForMuscle`. **No time, no network, no React.** | Create |
| `frontend/src/lib/muscles.test.js` | Table-driven structural tests that fail when the plan changes. | Create |
| `frontend/src/lib/recovery.js` | Pure time math: decay → freshness → band, day/hour labels. **Injectable clock, no React, no network.** | Create |
| `frontend/src/lib/recovery.test.js` | Clock-driven tests. | Create |
| `frontend/src/components/MuscleGroupPicker.jsx` | Presentation: ring SVG, chip grid, expand-to-detail, disclosure. Takes data as props; does not fetch. | Create |
| `frontend/src/components/MuscleGroupPicker.test.jsx` | Component tests. | Create |
| `frontend/src/pages/Home.jsx` | Days-since line, picker section, the one new fetch. | Modified |
| `frontend/src/pages/Home.test.jsx` | Tests for the new exported helpers/subcomponents. | Modified |
| `frontend/src/pages/Workout.jsx:107` | Guard the unguarded `PLAN[...]` deref. | Modified |
| `frontend/src/pages/Workout.test.jsx` | Test for the guard. | Modified |
| `frontend/src/index.css` | One `prefers-reduced-motion` rule for the ring. | Modified |

Taxonomy and time math are separate files because they change for different reasons — the taxonomy changes when the workout plan changes, the model changes when the research changes — and they want different test styles (table-driven vs. clock-driven).

---

## Task 1: Guard the unguarded PLAN dereference in Workout

Independent of everything else. Do it first to get it out of the way.

**Files:**
- Modify: `frontend/src/pages/Workout.jsx:107`
- Test: `frontend/src/pages/Workout.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks rely on.

**Background:** `Workout.jsx:162` already handles an unknown `workout_day` properly (`if (!plan) return <div…>Unknown workout day.</div>`). But the `useEffect` at line 107 runs before render gets there and throws a `TypeError` on `PLAN[s.workout_day].exercises`, killing the page. Only the effect needs fixing.

> **Refinement of spec §9:** the spec suggested reusing `planForDay` from `Home.jsx`. That is not needed — optional chaining does not duplicate the fallback object, and `nextIncompleteExerciseId([], …)` already returns `null` (see `frontend/src/lib/workoutFlow.js:6`), so the effect simply no-ops and the existing render guard at line 162 shows the proper error UI. Importing a page module into another page module to reuse a two-line helper is worse. If a reviewer prefers the `planForDay` route, move it to `workoutPlan.js` rather than cross-importing pages.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/pages/Workout.test.jsx`:

```jsx
describe('unknown workout_day', () => {
  it('renders the unknown-day fallback instead of throwing', async () => {
    const { api } = await import('../api')
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path.startsWith('/sessions/')) {
        return { id: 1, workout_day: 'bogus_day', completed: 0, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      return null
    })
    render(
      <MemoryRouter initialEntries={['/workout/1']}>
        <Routes><Route path="/workout/:sessionId" element={<Workout />} /></Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Unknown workout day.')).toBeInTheDocument()
  })
})
```

If `Workout.test.jsx` does not already import `MemoryRouter`, `Routes`, `Route`, `render`, `screen`, `vi` and the default `Workout` export, add those imports at the top of the file to match whatever the existing tests there use.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Workout.test.jsx`
Expected: FAIL — a `TypeError: Cannot read properties of undefined (reading 'exercises')` surfaces, or the `Unknown workout day.` text is never found.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/pages/Workout.jsx`, change line 107 from:

```jsx
      const firstId = nextIncompleteExerciseId(PLAN[s.workout_day].exercises, s.sets || [])
```

to:

```jsx
      // Unknown workout_day must not kill the effect — the render path below
      // already shows a proper "Unknown workout day." fallback.
      const firstId = nextIncompleteExerciseId(PLAN[s.workout_day]?.exercises || [], s.sets || [])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, including all 62 pre-existing frontend tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Workout.jsx frontend/src/pages/Workout.test.jsx
git commit -m "fix: guard unknown workout_day in Workout effect

PLAN[s.workout_day].exercises threw a TypeError before the render-path
guard at line 162 could show its fallback, killing the page."
```

---

## Task 2: Backend — GET /api/exercises/recency

**Files:**
- Modify: `backend/main.py` (add a route; place it next to `last_performance`, after the `/api/exercises/{exercise_id}/last` route around line 287)
- Test: `backend/test_recency.py` (create)

**Interfaces:**
- Consumes: the `sessions` and `sets` tables as they already exist. No schema change.
- Produces: `GET /api/exercises/recency` → JSON array, one object per exercise ever logged in a completed session:
  ```
  { "exercise_id": str, "last_date": "YYYY-MM-DD", "last_at": "YYYY-MM-DD HH:MM:SS",
    "sets": int, "volume_kg": float, "prev_date": "YYYY-MM-DD" | null }
  ```
  Tasks 5 and 7 consume exactly these field names.

**Route-ordering note:** FastAPI matches routes in declaration order. `/api/exercises/recency` must be declared **before** any `/api/exercises/{exercise_id}/…` route only if the paths could collide — they cannot here (`/recency` has one segment after `exercises`, the other has two), so declaration order is free. Put it after `last_performance` for readability.

- [ ] **Step 1: Write the failing tests**

Create `backend/test_recency.py`:

```python
from datetime import date, timedelta


def _session(client, mainmod, day, exercises, completed=True, on_date=None):
    """exercises: list of (exercise_id, exercise_name, n_sets, weight, reps)"""
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for ex_id, ex_name, n, w, reps in exercises:
        for i in range(n):
            client.post(f"/api/sessions/{sid}/sets", json={
                "exercise_id": ex_id, "exercise_name": ex_name,
                "set_number": i + 1, "reps": reps, "weight_kg": w})
    if completed:
        client.patch(f"/api/sessions/{sid}", json={"completed": True})
    if on_date:
        with mainmod.db() as conn:
            conn.execute("UPDATE sessions SET date = ? WHERE id = ?", (on_date, sid))
            conn.commit()
    return sid


def test_empty_db_returns_empty_list(client):
    assert client.get("/api/exercises/recency").json() == []


def test_single_session_reports_sets_volume_and_dates(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 7)], on_date="2026-08-12")
    rows = client.get("/api/exercises/recency").json()
    assert len(rows) == 1
    r = rows[0]
    assert r["exercise_id"] == "bench_press"
    assert r["last_date"] == "2026-08-12"
    assert r["sets"] == 3
    assert r["volume_kg"] == 3 * 80.0 * 7
    assert r["prev_date"] is None
    assert r["last_at"] is not None


def test_incomplete_sessions_are_excluded(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 7)], completed=False)
    assert client.get("/api/exercises/recency").json() == []


def test_prev_date_is_the_second_most_recent_session(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 70.0, 8)], on_date="2026-07-01")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 75.0, 8)], on_date="2026-08-05")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 3, 80.0, 8)], on_date="2026-08-12")
    r = client.get("/api/exercises/recency").json()[0]
    assert r["last_date"] == "2026-08-12"
    assert r["prev_date"] == "2026-08-05"


def test_only_logged_exercises_appear(client, mainmod):
    # Upper A has 6 planned exercises; log only 2 of them.
    _session(client, mainmod, "upper_a", [
        ("bench_press", "Bench Press", 3, 80.0, 7),
        ("db_curl", "Dumbbell Curl", 2, 14.0, 12),
    ], on_date="2026-08-12")
    ids = {r["exercise_id"] for r in client.get("/api/exercises/recency").json()}
    assert ids == {"bench_press", "db_curl"}


def test_last_at_is_the_max_logged_at_within_the_session(client, mainmod):
    sid = _session(client, mainmod, "upper_a",
                   [("bench_press", "Bench Press", 3, 80.0, 7)], on_date="2026-08-12")
    with mainmod.db() as conn:
        rows = conn.execute(
            "SELECT id FROM sets WHERE session_id = ? ORDER BY id", (sid,)).fetchall()
        for i, row in enumerate(rows):
            conn.execute("UPDATE sets SET logged_at = ? WHERE id = ?",
                         (f"2026-08-12 18:0{i}:00", row["id"]))
        conn.commit()
    r = client.get("/api/exercises/recency").json()[0]
    assert r["last_at"] == "2026-08-12 18:02:00"


def test_sets_and_volume_come_from_the_latest_session_only(client, mainmod):
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 5, 60.0, 10)], on_date="2026-07-01")
    _session(client, mainmod, "upper_a",
             [("bench_press", "Bench Press", 2, 80.0, 5)], on_date="2026-08-12")
    r = client.get("/api/exercises/recency").json()[0]
    assert r["sets"] == 2
    assert r["volume_kg"] == 2 * 80.0 * 5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest test_recency.py -q`
Expected: FAIL — every test 404s because the route does not exist.

- [ ] **Step 3: Write the implementation**

In `backend/main.py`, immediately after the `last_performance` function (which ends with the `return {"session_id": …}` line around line 287), add:

```python
@app.get("/api/exercises/recency")
def exercises_recency():
    # Powers the Home muscle-group picker: for each exercise, when it was last
    # trained, how much of it, and when it was trained before that.
    #
    # Completed sessions only, matching get_progress/all_progress. The cost is
    # that sets logged in an abandoned session don't count toward the recovery
    # estimate — it reads that muscle as fresher than it is. Same direction of
    # error as the unlogged-classes blind spot, and accepted for consistency.
    #
    # One query, not 22: /api/exercises/{id}/last is per-exercise and a Pi 3 B+
    # over gym wifi cannot serve a 22-request fan-out on page load.
    #
    # last_date comes from sessions.date (server-LOCAL, for calendar day counts)
    # while last_at comes from sets.logged_at (UTC, for hour counts). They are
    # deliberately different clocks — see the design doc, §4.5.
    with db() as conn:
        rows = conn.execute("""
            WITH per_session AS (
                SELECT st.exercise_id            AS exercise_id,
                       s.id                      AS session_id,
                       s.date                    AS date,
                       MAX(st.logged_at)         AS last_at,
                       COUNT(*)                  AS sets,
                       SUM(st.weight_kg * st.reps) AS volume_kg,
                       ROW_NUMBER() OVER (
                           PARTITION BY st.exercise_id
                           ORDER BY s.date DESC, s.id DESC
                       ) AS rn
                FROM sets st
                JOIN sessions s ON s.id = st.session_id
                WHERE s.completed = 1
                GROUP BY st.exercise_id, s.id, s.date
            )
            SELECT cur.exercise_id, cur.date AS last_date, cur.last_at,
                   cur.sets, cur.volume_kg, prev.date AS prev_date
            FROM per_session cur
            LEFT JOIN per_session prev
                   ON prev.exercise_id = cur.exercise_id AND prev.rn = 2
            WHERE cur.rn = 1
            ORDER BY cur.exercise_id
        """).fetchall()
        return [dict(r) for r in rows]
```

`ROW_NUMBER() OVER (…)` needs SQLite ≥ 3.25 (2018); the `python:3.11-slim` base is far newer. The existing `idx_sets_exercise` and `idx_sets_session` indexes (migration v2) cover the join.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest -q`
Expected: PASS — the 7 new tests plus all 42 pre-existing backend tests.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_recency.py
git commit -m "feat(api): add GET /api/exercises/recency

One query returning per-exercise last-trained date, timestamp, set count,
volume and the previous session's date (for novelty). Replaces a would-be
22-request fan-out over /api/exercises/{id}/last on Home load.

Read-only and additive: no schema change, no migration."
```

---

## Task 3: Muscle taxonomy — tags, groups, weights, τ

**Files:**
- Create: `frontend/src/lib/muscles.js`
- Test: `frontend/src/lib/muscles.test.js` (create)

**Interfaces:**
- Consumes: `PLAN` from `frontend/src/data/workoutPlan.js` (unchanged).
- Produces, for Tasks 4/5/6/7:
  - `MUSCLE_GROUPS: Array<{ id: string, label: string, tags: string[] }>` — 7 entries, display order.
  - `ALL_EXERCISES: Array<Exercise>` — every exercise across all 4 plan days.
  - `EXERCISE_BY_ID: Record<string, Exercise>`
  - `groupWeightsFor(exercise) → Record<groupId, 1.0 | 0.5>`
  - `tauFor(exerciseId) → number` (hours)
  - `PATTERN_TAU`, `EXERCISE_PATTERN`, `DIRECT_TAG_OVERRIDES` (exported for tests)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/muscles.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PLAN } from '../data/workoutPlan'
import {
  MUSCLE_GROUPS, ALL_EXERCISES, EXERCISE_BY_ID,
  groupWeightsFor, tauFor, EXERCISE_PATTERN, PATTERN_TAU,
} from './muscles'

const allTagsInPlan = [...new Set(ALL_EXERCISES.flatMap(e => e.muscles))]

describe('taxonomy covers the plan', () => {
  it('has 7 display groups', () => {
    expect(MUSCLE_GROUPS).toHaveLength(7)
  })

  it('maps every raw tag in PLAN to exactly one group', () => {
    const unmapped = allTagsInPlan.filter(
      tag => !MUSCLE_GROUPS.some(g => g.tags.includes(tag)))
    expect(unmapped).toEqual([])

    const doubled = allTagsInPlan.filter(
      tag => MUSCLE_GROUPS.filter(g => g.tags.includes(tag)).length > 1)
    expect(doubled).toEqual([])
  })

  it('has no dead tag entries that never appear in PLAN', () => {
    const dead = MUSCLE_GROUPS.flatMap(g => g.tags)
      .filter(tag => !allTagsInPlan.includes(tag))
    expect(dead).toEqual([])
  })

  it('classifies every exercise in PLAN with a known pattern', () => {
    const missing = ALL_EXERCISES
      .filter(e => !(e.id in EXERCISE_PATTERN))
      .map(e => e.id)
    expect(missing).toEqual([])

    const bad = Object.entries(EXERCISE_PATTERN)
      .filter(([, p]) => !(p in PATTERN_TAU))
      .map(([id]) => id)
    expect(bad).toEqual([])
  })

  it('indexes all 22 exercises', () => {
    expect(ALL_EXERCISES).toHaveLength(22)
    expect(Object.keys(EXERCISE_BY_ID)).toHaveLength(22)
  })
})

describe('groupWeightsFor', () => {
  it('weights the primary muscle 1.0 and the rest 0.5', () => {
    // bench_press: ['Chest', 'Front Delt', 'Triceps']
    expect(groupWeightsFor(EXERCISE_BY_ID.bench_press))
      .toEqual({ chest: 1.0, shoulders: 0.5, arms: 0.5 })
  })

  it('counts an exercise once per group, at its max weight', () => {
    // cable_row: ['Mid Back', 'Rhomboids', 'Lats', 'Biceps'] — first three are
    // all `back`; summing would triple-count one rowing movement.
    expect(groupWeightsFor(EXERCISE_BY_ID.cable_row))
      .toEqual({ back: 1.0, arms: 0.5 })
  })

  it('maps Upper Chest into chest', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.incline_press).chest).toBe(1.0)
  })

  it('maps both calf heads into calves', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.standing_calf)).toEqual({ calves: 1.0 })
    expect(groupWeightsFor(EXERCISE_BY_ID.seated_calf)).toEqual({ calves: 1.0 })
  })

  it('gives a single-tag isolation exercise exactly one group at 1.0', () => {
    expect(groupWeightsFor(EXERCISE_BY_ID.lateral_raise)).toEqual({ shoulders: 1.0 })
    expect(groupWeightsFor(EXERCISE_BY_ID.leg_ext)).toEqual({ quads: 1.0 })
  })

  it('lists the genuine primary muscle first for every planned exercise', () => {
    // The positional rule (index 0 → direct) is only valid while this holds.
    const expectedPrimary = {
      bench_press: 'Chest', bent_row: 'Lats', ohp: 'Front Delt',
      lat_pulldown: 'Lats', tricep_pushdown: 'Triceps', db_curl: 'Biceps',
      back_squat: 'Quads', rdl: 'Hamstrings', leg_press: 'Quads',
      leg_curl: 'Hamstrings', standing_calf: 'Gastrocnemius',
      incline_press: 'Upper Chest', pullup: 'Lats', cable_row: 'Mid Back',
      lateral_raise: 'Side Delt', hammer_curl: 'Brachialis',
      skull_crusher: 'Triceps (Long Head)',
      deadlift: 'Hamstrings', bss: 'Quads', hip_thrust: 'Glutes',
      leg_ext: 'Quads', seated_calf: 'Soleus',
    }
    ALL_EXERCISES.forEach(e => {
      expect(e.muscles[0]).toBe(expectedPrimary[e.id])
    })
  })
})

describe('tauFor', () => {
  it('uses 12h for isolation, 18h for multi-joint upper, 24h for multi-joint lower', () => {
    expect(tauFor('db_curl')).toBe(12)
    expect(tauFor('bench_press')).toBe(18)
    expect(tauFor('back_squat')).toBe(24)
  })

  it('falls back to the longest tau for an unclassified exercise', () => {
    // Conservative direction: an unknown exercise reads as MORE recently
    // trained, not less. Our error budget only tolerates overstating tiredness.
    expect(tauFor('some_future_exercise')).toBe(24)
  })
})

describe('plan sanity', () => {
  it('still has the 4 expected plan days', () => {
    expect(Object.keys(PLAN)).toEqual(['upper_a', 'lower_a', 'upper_b', 'lower_b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/muscles.test.js`
Expected: FAIL — `Failed to resolve import "./muscles"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/muscles.js`:

```js
// Muscle taxonomy for the Home picker and the recovery estimate.
//
// The `muscles:` arrays in workoutPlan.js are exercise-level form copy, not a
// taxonomy: 22 exercises carry 22 distinct raw tags at inconsistent
// granularity (`Chest` and `Upper Chest` but no unified chest; six back tags
// but no `Back`). Grouping by raw tag would produce 22 chips, several of which
// nobody thinks in. This module maps them; the plan data stays untouched.
//
// Pure data + pure functions. No time, no network, no React — recovery.js owns
// all the time arithmetic.
import { PLAN, CYCLE } from '../data/workoutPlan'

// Legs split three ways because the plan's own `tag` strings already draw
// those lines ("Quad · Hamstring · Calves").
export const MUSCLE_GROUPS = [
  { id: 'chest',     label: 'Chest',               tags: ['Chest', 'Upper Chest'] },
  { id: 'back',      label: 'Back',                tags: ['Lats', 'Mid Back', 'Rhomboids', 'Traps', 'Spinal Erectors', 'Lower Back'] },
  { id: 'shoulders', label: 'Shoulders',           tags: ['Front Delt', 'Side Delt', 'Rear Delt'] },
  { id: 'arms',      label: 'Arms',                tags: ['Biceps', 'Triceps', 'Triceps (Long Head)', 'Brachialis', 'Forearms'] },
  { id: 'quads',     label: 'Quads',               tags: ['Quads', 'Hip Flexors'] },
  { id: 'posterior', label: 'Hamstrings & Glutes', tags: ['Hamstrings', 'Glutes'] },
  { id: 'calves',    label: 'Calves',              tags: ['Gastrocnemius', 'Soleus'] },
]

const TAG_TO_GROUP = Object.fromEntries(
  MUSCLE_GROUPS.flatMap(g => g.tags.map(t => [t, g.id]))
)

export const ALL_EXERCISES = Object.values(PLAN).flatMap(d => d.exercises)
export const EXERCISE_BY_ID = Object.fromEntries(ALL_EXERCISES.map(e => [e.id, e]))

// All 22 exercises already list their primary muscle first, so direct/indirect
// is positional. This map exists so a future plan edit that breaks that
// assumption is a one-line fix rather than a rewrite of all 22 entries.
// Shape: { exerciseId: 'Raw Tag' } — that tag is treated as direct.
export const DIRECT_TAG_OVERRIDES = {}

// Recovery time constants key off MOVEMENT PATTERN, not muscle size. Dourado
// et al. (2023) compared knee extension against leg press in the same subjects
// on the same muscle: 24h vs 48h to recover peak torque. Nothing supports
// "small muscles recover faster".
export const PATTERN_TAU = {
  isolation: 12,       // anchored to Dourado's 24h single-joint recovery
  compound_upper: 18,  // INTERPOLATED — no study measures this directly
  compound_lower: 24,  // anchored to Dourado's 48h multi-joint recovery
}

export const EXERCISE_PATTERN = {
  tricep_pushdown: 'isolation', db_curl: 'isolation', hammer_curl: 'isolation',
  skull_crusher: 'isolation', lateral_raise: 'isolation', leg_curl: 'isolation',
  leg_ext: 'isolation', standing_calf: 'isolation', seated_calf: 'isolation',

  bench_press: 'compound_upper', incline_press: 'compound_upper',
  ohp: 'compound_upper', bent_row: 'compound_upper', cable_row: 'compound_upper',
  lat_pulldown: 'compound_upper', pullup: 'compound_upper',

  back_squat: 'compound_lower', deadlift: 'compound_lower', rdl: 'compound_lower',
  leg_press: 'compound_lower', bss: 'compound_lower', hip_thrust: 'compound_lower',
}

// Unclassified exercises get the LONGEST tau on purpose: the resulting estimate
// reads as more recently trained, never fresher. Our one-directional error
// budget (unlogged classes can only make us overstate freshness) has no room
// for a default that errs the other way.
export function tauFor(exerciseId) {
  return PATTERN_TAU[EXERCISE_PATTERN[exerciseId]] ?? PATTERN_TAU.compound_lower
}

// Direct ×1.0, indirect ×0.5 — two tiers, not three. Pelland et al. (2025)
// found indirect-as-0.5 best predicts adaptation; there is no evidence for a
// third tier.
//
// An exercise contributes to a group ONCE, at the max weight among its tags in
// that group. cable_row lists Mid Back / Rhomboids / Lats — all `back` —  and
// summing would triple-count a single rowing movement.
export function groupWeightsFor(exercise) {
  const out = {}
  if (!exercise?.muscles) return out
  exercise.muscles.forEach((tag, i) => {
    const groupId = TAG_TO_GROUP[tag]
    if (!groupId) return
    const direct = i === 0 || DIRECT_TAG_OVERRIDES[exercise.id] === tag
    const weight = direct ? 1.0 : 0.5
    out[groupId] = Math.max(out[groupId] ?? 0, weight)
  })
  return out
}

export { CYCLE }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/muscles.test.js`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/muscles.js frontend/src/lib/muscles.test.js
git commit -m "feat(muscles): add muscle-group taxonomy and pattern-based tau

Collapses the plan's 22 inconsistent raw muscle tags into 7 display groups.
Direct sets weight 1.0, indirect 0.5 (Pelland 2025). Recovery time constants
key off movement pattern, not muscle size (Dourado 2023).

Structural tests fail if a plan edit adds an unmapped tag or an unclassified
exercise."
```

---

## Task 4: Per-day set counts and bestDayForMuscle

**Files:**
- Modify: `frontend/src/lib/muscles.js` (append)
- Test: `frontend/src/lib/muscles.test.js` (append)

**Interfaces:**
- Consumes: `MUSCLE_GROUPS`, `groupWeightsFor`, `CYCLE`, `PLAN` from Task 3.
- Produces:
  - `groupSetsForDay(dayId) → Record<groupId, number>` — fractional sets that plan day gives each group.
  - `bestDayForMuscle(groupId, lastTrainedByDay = {}) → dayId | null`
    - `lastTrainedByDay`: `Record<dayId, 'YYYY-MM-DD' | null>`. Task 7 builds this from the `/api/sessions` response it already fetches.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/muscles.test.js` (and extend the import at the top of the file to include `groupSetsForDay` and `bestDayForMuscle`):

```js
describe('groupSetsForDay', () => {
  it('counts quads in Lower A as 6 fractional sets', () => {
    // back_squat 3 direct + leg_press 3 direct = 6 — this is the number the
    // recovery model's ref=6 is calibrated against.
    expect(groupSetsForDay('lower_a').quads).toBe(6)
  })

  it('counts chest as 3 in both upper days — the tie bestDayForMuscle must break', () => {
    expect(groupSetsForDay('upper_a').chest).toBe(3)
    expect(groupSetsForDay('upper_b').chest).toBe(3)
  })

  it('accumulates indirect contributions across exercises', () => {
    // Upper A arms: bench .5x3 + bent_row .5x3 + ohp .5x3 + lat_pulldown .5x3
    //             + tricep_pushdown 1x2 + db_curl 1x2 = 10
    expect(groupSetsForDay('upper_a').arms).toBe(10)
  })

  it('returns an empty object for an unknown day', () => {
    expect(groupSetsForDay('bogus_day')).toEqual({})
  })
})

describe('bestDayForMuscle', () => {
  it('picks the day with the most fractional sets', () => {
    expect(bestDayForMuscle('calves')).toBe('lower_a')  // 3 sets vs lower_b's 3…
  })

  it('breaks the chest tie toward the more rested day', () => {
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-14', upper_b: '2026-08-01' }))
      .toBe('upper_b')
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-01', upper_b: '2026-08-14' }))
      .toBe('upper_a')
  })

  it('treats a never-trained day as infinitely rested', () => {
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-14', upper_b: null }))
      .toBe('upper_b')
  })

  it('falls back to CYCLE order when nothing distinguishes the days', () => {
    expect(bestDayForMuscle('chest', {})).toBe('upper_a')
    expect(bestDayForMuscle('chest', { upper_a: '2026-08-10', upper_b: '2026-08-10' }))
      .toBe('upper_a')
  })

  it('returns a day for every display group', () => {
    MUSCLE_GROUPS.forEach(g => {
      expect(bestDayForMuscle(g.id)).not.toBeNull()
    })
  })

  it('returns null for a group no day trains', () => {
    expect(bestDayForMuscle('not_a_group')).toBeNull()
  })
})
```

> Note on the `calves` assertion: both `lower_a` (`standing_calf`, 3 sets) and `lower_b` (`seated_calf`, 3 sets) score 3, so this is also a tie and resolves by `CYCLE` order to `lower_a`. That is the intended behaviour — the assertion documents it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/muscles.test.js`
Expected: FAIL — `groupSetsForDay is not a function` / `bestDayForMuscle is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `frontend/src/lib/muscles.js`:

```js
// Fractional sets each plan day gives each muscle group.
export function groupSetsForDay(dayId) {
  const day = PLAN[dayId]
  const out = {}
  if (!day) return out
  day.exercises.forEach(ex => {
    Object.entries(groupWeightsFor(ex)).forEach(([groupId, weight]) => {
      out[groupId] = (out[groupId] ?? 0) + ex.sets * weight
    })
  })
  return out
}

// Older ISO date sorts first; a never-trained day (null) beats any date.
// Returns false on a genuine tie so the caller keeps its incumbent, which
// makes CYCLE order the final deterministic fallback.
function isMoreRested(candidate, incumbent) {
  if (candidate === null && incumbent === null) return false
  if (candidate === null) return true
  if (incumbent === null) return false
  return candidate < incumbent
}

// Which of the 4 plan days trains this group most? Ties break toward the more
// rested day, which is what couples the picker to the recovery estimate.
export function bestDayForMuscle(groupId, lastTrainedByDay = {}) {
  let best = null
  for (const dayId of CYCLE) {
    const score = groupSetsForDay(dayId)[groupId] ?? 0
    const last = lastTrainedByDay[dayId] ?? null
    if (best === null || score > best.score) {
      best = { dayId, score, last }
    } else if (score === best.score && isMoreRested(last, best.last)) {
      best = { dayId, score, last }
    }
  }
  return best && best.score > 0 ? best.dayId : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/muscles.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/muscles.js frontend/src/lib/muscles.test.js
git commit -m "feat(muscles): score plan days per group, pick the best day

bestDayForMuscle scores each of the 4 plan days by fractional set count and
breaks ties toward the more rested day. The chest tie (bench 3 vs incline 3)
is real, not hypothetical."
```

---

## Task 5: The recovery model

**Files:**
- Create: `frontend/src/lib/recovery.js`
- Test: `frontend/src/lib/recovery.test.js` (create)

**Interfaces:**
- Consumes: `MUSCLE_GROUPS`, `EXERCISE_BY_ID`, `groupWeightsFor`, `tauFor` from Task 3. Recency rows in the exact shape Task 2 produces.
- Produces, for Tasks 6/7:
  - `groupRecovery(recencyRows, now = Date.now()) → Array<GroupRecovery>` — one entry per group, in `MUSCLE_GROUPS` order:
    ```
    { id, label, freshness: number,        // 0..1, never rendered as a number
      band: 'Fresh' | 'Partly recovered (est.)' | 'Recently trained' | 'Not trained yet',
      hoursSince: number | null, daysSince: number | null,
      daysSinceLabel: string, fractionalSets: number, lastDate: string | null }
    ```
  - `lastWorkoutLabel(sessions, now = Date.now()) → string`
  - `bandFor(freshness | null) → string`, `dayLabel(lastDate, todayIso) → string`,
    `localToday(date) → 'YYYY-MM-DD'`, `hoursSince(ts, nowMs) → number`,
    `daysBetweenDates(fromIso, toIso) → number`, `noveltyFor(row) → 1 | 1.5`
  - Constants: `REF_SETS`, `NOVELTY_FACTOR`, `NOVELTY_DAYS`, `BANDS`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/recovery.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  groupRecovery, bandFor, dayLabel, localToday, hoursSince,
  daysBetweenDates, noveltyFor, lastWorkoutLabel, REF_SETS,
} from './recovery'

// A UTC instant we can do exact arithmetic against.
const AT = '2026-08-12 18:00:00'
const AT_MS = Date.parse('2026-08-12T18:00:00Z')
const H = 3600_000

const row = (over = {}) => ({
  exercise_id: 'back_squat', last_date: '2026-08-12', last_at: AT,
  sets: 3, volume_kg: 1000, prev_date: '2026-08-08', ...over,
})

// Lower A quads: back_squat 3 direct + leg_press 3 direct = 6 fractional sets.
const lowerADay = [
  row({ exercise_id: 'back_squat' }),
  row({ exercise_id: 'leg_press' }),
]
const quads = (rows, nowMs) => groupRecovery(rows, nowMs).find(g => g.id === 'quads')

describe('groupRecovery — the quads-after-Lower-A sanity table', () => {
  it('reads Recently trained at 0h', () => {
    const g = quads(lowerADay, AT_MS)
    expect(g.freshness).toBeCloseTo(0, 5)
    expect(g.band).toBe('Recently trained')
  })

  it('reads Partly recovered at 24h', () => {
    const g = quads(lowerADay, AT_MS + 24 * H)
    expect(g.freshness).toBeCloseTo(0.632, 2)
    expect(g.band).toBe('Partly recovered (est.)')
  })

  it('reads Fresh at 48h — Dourado 2023s multi-joint recovery point', () => {
    const g = quads(lowerADay, AT_MS + 48 * H)
    expect(g.freshness).toBeCloseTo(0.865, 2)
    expect(g.band).toBe('Fresh')
  })
})

describe('groupRecovery — novelty', () => {
  const novel = lowerADay.map(r => ({ ...r, prev_date: null }))

  it('applies the 1.5x novelty factor, pushing each band one step later', () => {
    expect(quads(novel, AT_MS + 24 * H).freshness).toBeCloseTo(0.448, 2)
    expect(quads(novel, AT_MS + 24 * H).band).toBe('Partly recovered (est.)')
    expect(quads(novel, AT_MS + 48 * H).freshness).toBeCloseTo(0.797, 2)
    expect(quads(novel, AT_MS + 48 * H).band).toBe('Fresh')
  })
})

describe('noveltyFor', () => {
  it('is 1.5 with no previous session', () => {
    expect(noveltyFor(row({ prev_date: null }))).toBe(1.5)
  })
  it('is 1.5 at exactly 28 days', () => {
    expect(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-15' }))).toBe(1.5)
  })
  it('is 1.0 at 27 days', () => {
    expect(noveltyFor(row({ last_date: '2026-08-12', prev_date: '2026-07-16' }))).toBe(1.0)
  })
})

describe('load capping', () => {
  it('caps at 1.0 so freshness never goes negative', () => {
    const heavy = [row({ sets: 40 }), row({ exercise_id: 'leg_press', sets: 40 })]
    const g = quads(heavy, AT_MS)
    expect(g.freshness).toBe(0)
  })
})

describe('bandFor boundaries', () => {
  it('is Fresh at exactly 0.75', () => expect(bandFor(0.75)).toBe('Fresh'))
  it('is Partly recovered just below 0.75', () =>
    expect(bandFor(0.7499)).toBe('Partly recovered (est.)'))
  it('is Partly recovered at exactly 0.35', () =>
    expect(bandFor(0.35)).toBe('Partly recovered (est.)'))
  it('is Recently trained just below 0.35', () =>
    expect(bandFor(0.3499)).toBe('Recently trained'))
  it('is Not trained yet for null', () => expect(bandFor(null)).toBe('Not trained yet'))
})

describe('never-trained groups', () => {
  it('reads Not trained yet, not Fresh', () => {
    const g = groupRecovery([], AT_MS).find(x => x.id === 'chest')
    expect(g.band).toBe('Not trained yet')
    expect(g.daysSince).toBeNull()
    expect(g.hoursSince).toBeNull()
    expect(g.daysSinceLabel).toBe('Not trained yet')
  })

  it('returns one entry per group even with no data', () => {
    expect(groupRecovery([], AT_MS)).toHaveLength(7)
  })
})

describe('indirect contributions count as training', () => {
  it('bench press counts as having trained arms', () => {
    const g = groupRecovery([row({ exercise_id: 'bench_press' })], AT_MS)
      .find(x => x.id === 'arms')
    expect(g.band).not.toBe('Not trained yet')
    expect(g.fractionalSets).toBe(1.5)  // 3 sets x 0.5 indirect
  })
})

describe('time handling', () => {
  it('parses logged_at as UTC, matching History.jsx', () => {
    expect(hoursSince('2026-08-12 18:00:00', Date.parse('2026-08-12T21:00:00Z')))
      .toBeCloseTo(3, 6)
  })

  it('clamps a future timestamp to 0 rather than producing freshness > 1', () => {
    expect(hoursSince(AT, AT_MS - 5 * H)).toBe(0)
    expect(quads(lowerADay, AT_MS - 5 * H).freshness).toBe(0)
  })

  it('counts days by calendar, not by dividing hours', () => {
    // 22:00 local yesterday -> 08:00 local today is 10 hours but one day.
    const yesterday = new Date(2026, 7, 11, 22, 0, 0)
    const today = new Date(2026, 7, 12, 8, 0, 0)
    expect(dayLabel(localToday(yesterday), localToday(today))).toBe('Yesterday')
  })

  it('labels same-day as Today and older gaps in days', () => {
    expect(dayLabel('2026-08-12', '2026-08-12')).toBe('Today')
    expect(dayLabel('2026-08-09', '2026-08-12')).toBe('3 days ago')
  })

  it('computes localToday in the local frame, not UTC', () => {
    expect(localToday(new Date(2026, 7, 12, 0, 30, 0))).toBe('2026-08-12')
  })

  it('measures whole days between ISO dates', () => {
    expect(daysBetweenDates('2026-08-09', '2026-08-12')).toBe(3)
  })
})

describe('lastWorkoutLabel', () => {
  const NOW = new Date(2026, 7, 12, 12).getTime()   // local noon, 2026-08-12
  const on = d => ({ date: d, completed: 1 })

  it('reports the empty state with no sessions', () => {
    expect(lastWorkoutLabel([], NOW)).toBe('No workouts logged yet')
    expect(lastWorkoutLabel(null, NOW)).toBe('No workouts logged yet')
  })

  it('reports the most recent completed session', () => {
    expect(lastWorkoutLabel([on('2026-08-09'), on('2026-08-01')], NOW))
      .toBe('Last workout 3 days ago')
  })

  it('ignores in-progress sessions', () => {
    const sessions = [{ date: '2026-08-12', completed: 0 }, on('2026-08-09')]
    expect(lastWorkoutLabel(sessions, NOW)).toBe('Last workout 3 days ago')
  })

  it('says Today and Yesterday rather than a day count', () => {
    expect(lastWorkoutLabel([on('2026-08-12')], NOW)).toBe('Last workout today')
    expect(lastWorkoutLabel([on('2026-08-11')], NOW)).toBe('Last workout yesterday')
  })
})

describe('exported constants', () => {
  it('uses ref = 6 fractional sets', () => expect(REF_SETS).toBe(6))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/recovery.test.js`
Expected: FAIL — `Failed to resolve import "./recovery"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/recovery.js`:

```js
// Estimated stimulus decay per muscle group, from training logs alone.
//
// This is an ESTIMATE and the UI must always say so. We have elapsed time and
// logged volume; we do not have HRV, sleep, soreness, or anything else the
// commercial "recovery score" products composite. See
// docs/superpowers/research/2026-08-16-recovery-science.md.
//
// Nothing here is fitted and there are no per-user parameters, because there
// is no ground truth to fit against. A fitted model would be more confident,
// not more correct.
import { MUSCLE_GROUPS, EXERCISE_BY_ID, groupWeightsFor, tauFor } from './muscles'

export const REF_SETS = 6        // fractional sets that make one full stimulus unit
export const NOVELTY_FACTOR = 1.5 // repeated-bout effect
export const NOVELTY_DAYS = 28
export const BANDS = { fresh: 0.75, partly: 0.35 }

const MS_PER_HOUR = 3600_000
const MS_PER_DAY = 86400_000

// logged_at / created_at are UTC written by SQLite's datetime('now') with no
// zone suffix. Same parse idiom as frontend/src/pages/History.jsx:9.
export function parseUtc(ts) {
  return Date.parse(String(ts).replace(' ', 'T') + 'Z')
}

// Clamped at 0: a clock-skewed future timestamp must not produce freshness > 1.
export function hoursSince(ts, nowMs) {
  const ms = nowMs - parseUtc(ts)
  return ms > 0 ? ms / MS_PER_HOUR : 0
}

// Calendar days between two 'YYYY-MM-DD' strings. Both are parsed at UTC
// midnight so DST never shifts the difference off a whole number.
export function daysBetweenDates(fromIso, toIso) {
  const from = Date.parse(fromIso + 'T00:00:00Z')
  const to = Date.parse(toIso + 'T00:00:00Z')
  return Math.round((to - from) / MS_PER_DAY)
}

// sessions.date is written server-LOCAL (backend/main.py:154 uses
// datetime.now(), not datetime('now')), so "3 days ago" must be computed
// against the client's local today — not against a UTC date.
export function localToday(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function dayLabel(lastDate, todayIso) {
  if (!lastDate) return 'Not trained yet'
  const days = daysBetweenDates(lastDate, todayIso)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// The repeated-bout effect: a first-ever RDL session and the tenth are not the
// same event. prev_date is the only reason /api/exercises/recency carries it.
export function noveltyFor(row) {
  if (!row.prev_date) return NOVELTY_FACTOR
  return daysBetweenDates(row.prev_date, row.last_date) >= NOVELTY_DAYS
    ? NOVELTY_FACTOR
    : 1.0
}

// Three bands, because three is the model's honest resolution. A percentage
// would imply a measurement nobody took.
export function bandFor(freshness) {
  if (freshness === null || freshness === undefined) return 'Not trained yet'
  if (freshness >= BANDS.fresh) return 'Fresh'
  if (freshness >= BANDS.partly) return 'Partly recovered (est.)'
  return 'Recently trained'
}

// load      = min(1, SUM over the group's exercises of
//                     min(1, fractionalSets / 6) x novelty x exp(-hours / tau))
// freshness = 1 - load
//
// Two deliberate deviations from the research doc's formula, both in the
// design doc §4.2: the min() cap applies per exercise bout rather than per
// session (tau varies per exercise, so a session is not one term), and only
// each exercise's most recent bout is summed (a bout two sessions back
// contributes <=1.8% at tau <= 24h — below the resolution of three bands).
export function groupRecovery(recency, nowMs = Date.now()) {
  const todayIso = localToday(new Date(nowMs))
  const acc = {}
  MUSCLE_GROUPS.forEach(g => {
    acc[g.id] = { load: 0, lastAt: null, lastDate: null, sets: 0 }
  })

  const rows = (recency || []).filter(r => EXERCISE_BY_ID[r.exercise_id])

  // Pass 1 — accumulate decayed load, and find each group's most recent bout.
  rows.forEach(r => {
    const tau = tauFor(r.exercise_id)
    const hours = hoursSince(r.last_at, nowMs)
    const novelty = noveltyFor(r)
    const decay = Math.exp(-hours / tau)
    Object.entries(groupWeightsFor(EXERCISE_BY_ID[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId]
      if (!g) return
      g.load += Math.min(1, (r.sets * w) / REF_SETS) * novelty * decay
      if (g.lastDate === null || r.last_date > g.lastDate) {
        g.lastDate = r.last_date
        g.lastAt = r.last_at
      }
    })
  })

  // Pass 2 — fractional sets on that most recent date. Separate pass because
  // it needs each group's winning date, which pass 1 is still discovering.
  rows.forEach(r => {
    Object.entries(groupWeightsFor(EXERCISE_BY_ID[r.exercise_id])).forEach(([groupId, w]) => {
      const g = acc[groupId]
      if (g && r.last_date === g.lastDate) g.sets += r.sets * w
    })
  })

  return MUSCLE_GROUPS.map(group => {
    const g = acc[group.id]
    const trained = g.lastDate !== null
    const freshness = trained ? 1 - Math.min(1, g.load) : null
    return {
      id: group.id,
      label: group.label,
      freshness,
      band: bandFor(freshness),
      hoursSince: trained ? Math.round(hoursSince(g.lastAt, nowMs)) : null,
      daysSince: trained ? daysBetweenDates(g.lastDate, todayIso) : null,
      daysSinceLabel: dayLabel(g.lastDate, todayIso),
      fractionalSets: Math.round(g.sets * 10) / 10,
      lastDate: g.lastDate,
    }
  })
}

// Completed sessions only, matching /api/exercises/recency — otherwise an
// in-progress session would report "Last workout today" before it is finished.
export function lastWorkoutLabel(sessions, nowMs = Date.now()) {
  const done = (sessions || []).filter(s => s.completed)
  if (!done.length) return 'No workouts logged yet'
  const latest = done.reduce((a, b) => (b.date > a.date ? b : a))
  const todayIso = localToday(new Date(nowMs))
  return `Last workout ${dayLabel(latest.date, todayIso).toLowerCase()}`
}
```

> **Note on `freshness: null`** for a never-trained group: Task 6's ring renders an empty circle for `null`. Do not substitute `1` — a group that has never been trained is not "Fresh", it is unknown, and the band label says so.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/recovery.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/recovery.js frontend/src/lib/recovery.test.js
git commit -m "feat(recovery): add the stimulus-decay model

load = sum of min(1, fractionalSets/6) * novelty * exp(-hours/tau), capped
at 1; freshness = 1 - load, rendered as one of three bands and never as a
number. Nothing fitted, no per-user parameters.

Day counts use sessions.date against the client's local today; hour counts
use sets.logged_at parsed as UTC — the backend writes those two fields from
different clocks."
```

---

## Task 6: The picker component

**Files:**
- Create: `frontend/src/components/MuscleGroupPicker.jsx`
- Modify: `frontend/src/index.css` (one `prefers-reduced-motion` rule)
- Test: `frontend/src/components/MuscleGroupPicker.test.jsx` (create)

**Interfaces:**
- Consumes: `GroupRecovery` objects from Task 5, `bestDayForMuscle` from Task 4, `PLAN` and `DAY_COLORS` from `workoutPlan.js`.
- Produces, for Task 7:
  - default export `MuscleGroupPicker({ groups, lastTrainedByDay, activeSession, starting, onStart })`
    - `groups`: the array from `groupRecovery`
    - `lastTrainedByDay`: `Record<dayId, 'YYYY-MM-DD' | null>`
    - `activeSession`: truthy when a session is in progress → Start buttons are replaced
    - `onStart(dayId)`: called when the user taps Start in an expanded chip
  - named exports for tests: `RecoveryRing`, `ringColor`, `MuscleChip`, `DISCLOSURE`

- [ ] **Step 0: Load the `dataviz` skill**

Spec §6.3 requires it: `Skill(skill: "dataviz")`. It is installed and is the right tool for
the ring/meter design — no UI/UX specialist agent exists to consult. Read it before writing
the SVG below, and let it override the ring's visual details (stroke weight, track contrast,
colour ramp endpoints) where it disagrees. What it must **not** override: no numerals in the
label, no red/amber/green semantics, and the band label stays as the non-colour channel.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/MuscleGroupPicker.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MuscleGroupPicker, { RecoveryRing, ringColor, DISCLOSURE } from './MuscleGroupPicker'

const group = (over = {}) => ({
  id: 'quads', label: 'Quads', freshness: 0.63,
  band: 'Partly recovered (est.)', hoursSince: 31, daysSince: 1,
  daysSinceLabel: 'Yesterday', fractionalSets: 6, lastDate: '2026-08-11', ...over,
})

const untrained = group({
  id: 'chest', label: 'Chest', freshness: null, band: 'Not trained yet',
  hoursSince: null, daysSince: null, daysSinceLabel: 'Not trained yet',
  fractionalSets: 0, lastDate: null,
})

describe('ringColor', () => {
  it('never returns a red or amber hue — no warning semantics', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = ringColor(f).match(/\d+/g).map(Number)
      expect(g).toBeGreaterThanOrEqual(r)   // green channel always leads
      expect(b).toBeGreaterThanOrEqual(r)
    }
  })

  it('has a distinct muted colour for a never-trained group', () => {
    expect(ringColor(null)).not.toBe(ringColor(0))
  })
})

describe('RecoveryRing', () => {
  it('is decorative — the band label carries the meaning', () => {
    const { container } = render(<RecoveryRing freshness={0.5} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an empty arc for a never-trained group', () => {
    const { container } = render(<RecoveryRing freshness={null} />)
    const arc = container.querySelectorAll('circle')[1]
    expect(Number(arc.getAttribute('stroke-dashoffset')))
      .toBeCloseTo(Number(arc.getAttribute('stroke-dasharray')), 3)
  })

  it('renders no numerals anywhere', () => {
    const { container } = render(<RecoveryRing freshness={0.63} />)
    expect(container.textContent).toBe('')
  })
})

describe('MuscleGroupPicker', () => {
  const groups = [group(), untrained]

  it('renders a chip per group with its band label', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(screen.getByText('Quads')).toBeInTheDocument()
    expect(screen.getByText('Partly recovered (est.)')).toBeInTheDocument()
    expect(screen.getByText('Not trained yet')).toBeInTheDocument()
  })

  it('shows the disclosure at the point of display', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(screen.getByText(DISCLOSURE)).toBeInTheDocument()
    expect(DISCLOSURE).toContain('Trust how you feel over this estimate.')
  })

  it('renders no percentage anywhere', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(container.textContent).not.toMatch(/%/)
    expect(container.textContent).not.toMatch(/percent/i)
  })

  it('does not start a workout on the first tap — it expands', () => {
    const onStart = vi.fn()
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByText(/last trained 31h ago, 6 fractional sets/i)).toBeInTheDocument()
  })

  it('starts the best day from the expanded chip', () => {
    const onStart = vi.fn()
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Lower A' }))
    expect(onStart).toHaveBeenCalledWith('lower_a')
  })

  it('collapses a chip when tapped again', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Quads/ })
    fireEvent.click(chip)
    expect(screen.getByRole('button', { name: 'Start Lower A' })).toBeInTheDocument()
    fireEvent.click(chip)
    expect(screen.queryByRole('button', { name: 'Start Lower A' })).not.toBeInTheDocument()
  })

  it('replaces Start with a note while a session is active', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}}
      activeSession={{ id: 4 }} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Quads/ }))
    expect(screen.queryByRole('button', { name: /^Start / })).not.toBeInTheDocument()
    expect(screen.getByText('Finish your current session first')).toBeInTheDocument()
  })

  it('shows a neutral fact, not a nudge, for a never-trained group', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Chest/ }))
    expect(screen.getByText(/Chest — not trained yet/i)).toBeInTheDocument()
  })

  it('uses none of the banned words', () => {
    const { container } = render(
      <MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const text = container.textContent.toLowerCase()
    for (const word of ['readiness', 'fatigue', 'overtrain', 'optimal', 'risk']) {
      expect(text).not.toContain(word)
    }
  })

  it('gives every chip a >=44px tap target', () => {
    render(<MuscleGroupPicker groups={groups} lastTrainedByDay={{}} onStart={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /Quads/ })
    expect(chip.className).toContain('tap-target')
    expect(parseInt(chip.style.minHeight, 10)).toBeGreaterThanOrEqual(44)
  })

  it('renders nothing when there are no groups', () => {
    const { container } = render(
      <MuscleGroupPicker groups={[]} lastTrainedByDay={{}} onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/MuscleGroupPicker.test.jsx`
Expected: FAIL — `Failed to resolve import "./MuscleGroupPicker"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/MuscleGroupPicker.jsx`:

```jsx
import { useState } from 'react'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'
import { bestDayForMuscle } from '../lib/muscles'

// Shown at the point of display, never in settings and never behind an icon.
// The blind spot it discloses is one-directional: unlogged training can only
// make this estimate OVERSTATE freshness, never understate it.
export const DISCLOSURE =
  'Estimated from your logged training only — no sleep or HRV data, and it ' +
  "doesn't know about classes or training you log elsewhere. Trust how you " +
  'feel over this estimate.'

// Single-hue ramp, dim slate to the app's accent green. Deliberately NOT
// red/amber/green: "Recently trained" is a fact, not a warning, and must not
// look like one.
export function ringColor(freshness) {
  if (freshness === null || freshness === undefined) return 'rgb(42, 42, 62)'
  const t = Math.max(0, Math.min(1, freshness))
  const lerp = (a, b) => Math.round(a + (b - a) * t)
  return `rgb(${lerp(75, 110)}, ${lerp(85, 231)}, ${lerp(99, 183)})`
}

// Continuous and smoothly animatable — the ring is the part that moves. The
// TEXT is always a band label, never a numeral.
export function RecoveryRing({ freshness, size = 44 }) {
  const stroke = 4
  const r = (size - stroke - 2) / 2
  const circumference = 2 * Math.PI * r
  const filled = freshness === null || freshness === undefined
    ? 0
    : Math.max(0, Math.min(1, freshness))
  return (
    <svg className="recovery-ring" width={size} height={size}
      viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#1e1e32" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={ringColor(freshness)} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - filled)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms ease-out, stroke 600ms ease-out' }} />
    </svg>
  )
}

function rawFact(group) {
  if (!group.lastDate) return `${group.label} — not trained yet.`
  return `${group.label} — last trained ${group.hoursSince}h ago, ` +
    `${group.fractionalSets} fractional sets.`
}

export function MuscleChip({ group, expanded, onToggle }) {
  return (
    <button className="tap-target" onClick={onToggle} aria-expanded={expanded}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        minHeight: 56, padding: '8px 10px', textAlign: 'left',
        background: expanded ? '#15152a' : 'none',
        border: '1px solid #1e1e32', borderRadius: 12, cursor: 'pointer',
        color: 'inherit',
      }}>
      <RecoveryRing freshness={group.freshness} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem' }}>
          {group.label}
        </span>
        <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.7rem' }}>
          {group.band}
        </span>
      </span>
    </button>
  )
}

export default function MuscleGroupPicker({
  groups, lastTrainedByDay = {}, activeSession = null, starting = false, onStart,
}) {
  const [expandedId, setExpandedId] = useState(null)
  if (!groups?.length) return null

  const expanded = groups.find(g => g.id === expandedId) || null
  const bestDayId = expanded ? bestDayForMuscle(expanded.id, lastTrainedByDay) : null
  const bestDay = bestDayId ? PLAN[bestDayId] : null

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Muscle groups
      </p>

      <div style={{ display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {groups.map(g => (
          <MuscleChip key={g.id} group={g} expanded={expandedId === g.id}
            onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)} />
        ))}
      </div>

      {expanded && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          {/* The one line on this screen that is simply true. */}
          <p style={{ color: '#e5e7eb', fontSize: '0.8rem' }}>{rawFact(expanded)}</p>
          <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 4 }}>
            {expanded.daysSinceLabel}
          </p>
          {bestDay && (
            <>
              <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: 12 }}>
                Best day for {expanded.label} → {bestDay.emoji} {bestDay.name}
              </p>
              {activeSession ? (
                <p style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 8 }}>
                  Finish your current session first
                </p>
              ) : (
                <button className="btn-primary" disabled={starting}
                  onClick={() => onStart(bestDayId)}
                  style={{ background: DAY_COLORS[bestDayId] || '#9ca3af', marginTop: 12 }}>
                  {starting ? 'Starting…' : `Start ${bestDay.name}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: 12, lineHeight: 1.5 }}>
        {DISCLOSURE}
      </p>
    </div>
  )
}
```

Then append to `frontend/src/index.css`:

```css
/* The ring animates its fill; honour a reduced-motion preference by snapping
   straight to the final value. */
@media (prefers-reduced-motion: reduce) {
  .recovery-ring circle { transition: none !important; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/MuscleGroupPicker.test.jsx`
Expected: PASS.

- [ ] **Step 5: Check the 320px constraint by hand**

Run: `cd frontend && npm run dev`, open the app at 320px width in device emulation, and confirm the chip grid does not overflow horizontally and every chip is ≥44px tall. The grid uses `minmax(140px, 1fr)` with `auto-fit`, so it collapses to a single column below ~300px of content width. If it overflows, reduce the `minmax` floor — do not add a horizontal scroller.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MuscleGroupPicker.jsx \
        frontend/src/components/MuscleGroupPicker.test.jsx \
        frontend/src/index.css
git commit -m "feat(ui): add the muscle-group picker with recovery rings

Continuous animated ring plus a band label — never a number. Tapping a chip
expands it to the raw fact and an explicit Start button rather than starting
a session on the first tap. Disclosure renders at the point of display.

Single-hue colour ramp: no red/amber/green warning semantics, and the band
label means colour is never the only channel carrying state."
```

---

## Task 7: Wire it into Home

**Files:**
- Modify: `frontend/src/pages/Home.jsx`
- Test: `frontend/src/pages/Home.test.jsx`

**Interfaces:**
- Consumes: `groupRecovery` and `lastWorkoutLabel` (Task 5), `MuscleGroupPicker` (Task 6), `GET /api/exercises/recency` (Task 2).
- Produces: a new named export `lastTrainedByDay(sessions)` for testing.

**Note:** `Home.test.jsx` tests exported pure helpers and small subcomponents rather than the default `Home` export (which fetches). Follow that pattern — the new tests target `lastTrainedByDay`, and `MuscleGroupPicker`'s own behaviour is already covered by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/pages/Home.test.jsx` (and add `lastTrainedByDay` to the existing import from `./Home`):

```jsx
describe('lastTrainedByDay', () => {
  it('maps each plan day to its most recent completed session date', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 1 },
      { workout_day: 'lower_a', date: '2026-08-10', completed: 1 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions)).toEqual({
      upper_a: '2026-08-12', lower_a: '2026-08-10',
    })
  })

  it('ignores in-progress sessions', () => {
    const sessions = [
      { workout_day: 'upper_a', date: '2026-08-12', completed: 0 },
      { workout_day: 'upper_a', date: '2026-08-05', completed: 1 },
    ]
    expect(lastTrainedByDay(sessions)).toEqual({ upper_a: '2026-08-05' })
  })

  it('handles no sessions', () => {
    expect(lastTrainedByDay([])).toEqual({})
    expect(lastTrainedByDay(null)).toEqual({})
  })

  it('ignores sessions whose workout_day is not a plan day', () => {
    expect(lastTrainedByDay([{ workout_day: 'bogus', date: '2026-08-12', completed: 1 }]))
      .toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Home.test.jsx`
Expected: FAIL — `lastTrainedByDay is not a function`.

- [ ] **Step 3: Write the implementation**

In `frontend/src/pages/Home.jsx`:

**3a.** Extend the imports at the top:

```jsx
import { PLAN, getNextWorkoutId, DAY_COLORS, CYCLE } from '../data/workoutPlan'
import { groupRecovery, lastWorkoutLabel } from '../lib/recovery'
import MuscleGroupPicker from '../components/MuscleGroupPicker'
```

**3b.** Add this exported helper next to `planForDay` (around line 11):

```jsx
// Most recent COMPLETED session date per plan day. Feeds bestDayForMuscle's
// tie-break; derived from the /sessions response Home already fetches, so the
// picker costs exactly one extra request (/exercises/recency), not two.
export function lastTrainedByDay(sessions) {
  const out = {}
  ;(sessions || []).forEach(s => {
    if (!s.completed || !CYCLE.includes(s.workout_day)) return
    if (!out[s.workout_day] || s.date > out[s.workout_day]) {
      out[s.workout_day] = s.date
    }
  })
  return out
}
```

**3c.** Add recency state and its fetch. Replace the existing `useEffect` (lines 49-51) with:

```jsx
  const [recency, setRecency] = useState([])

  useEffect(() => {
    api.get('/sessions').then(s => { setSessions(s); setLoading(false) }).catch(() => setLoading(false))
    // The picker is additive — if this fails, Home still works without it.
    api.get('/exercises/recency').then(setRecency).catch(() => setRecency([]))
  }, [])
```

(Declare `const [recency, setRecency] = useState([])` alongside the other `useState` calls at the top of the component rather than inside the effect block; it is shown here only to keep the diff in one place.)

**3d.** Derive the view data, just after `const lastPlan = …` (line 59):

```jsx
  const groups = groupRecovery(recency)
  const trainedByDay = lastTrainedByDay(sessions)
```

**3e.** Add a `startDay` helper next to `startWorkout`. `startWorkout` currently hardcodes `nextId`; generalise it so the picker can reuse it:

```jsx
  async function startDay(dayId) {
    setStarting(true)
    try {
      const s = await api.post('/sessions', { workout_day: dayId })
      track('session_start', { day: dayId })
      await refresh()
      nav(`/workout/${s.id}`)
    } catch (e) {
      setToast('Failed to start — is the backend up?')
      setTimeout(() => setToast(null), 2500)
      setStarting(false)
    }
  }

  const startWorkout = () => startDay(nextId)
```

Delete the old `async function startWorkout()` body — `startDay` replaces it verbatim apart from the parameter.

**3f.** Add the days-since line to the header. After the `{next.tag}` paragraph (line 90):

```jsx
        <p style={{ color: '#9ca3af', marginTop: 6, fontSize: '0.8rem' }}>
          {lastWorkoutLabel(sessions)}
        </p>
```

**3g.** Mount the picker between the Start button (line 125) and the "Last session" block (line 128):

```jsx
      <MuscleGroupPicker
        groups={groups}
        lastTrainedByDay={trainedByDay}
        activeSession={active}
        starting={starting}
        onStart={startDay}
      />
```

- [ ] **Step 4: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS — the new tests plus all pre-existing frontend tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: PASS — 42 pre-existing plus the 7 from Task 2.

- [ ] **Step 6: Verify in the running app**

Run: `cd frontend && npm run dev` with the backend running, and confirm on Home:
- the days-since line under the header reads sensibly (or `No workouts logged yet` on an empty DB);
- seven chips render, each with a ring and a band label, and **no numerals** appear in any band;
- tapping a chip expands it, shows the raw-fact line, and offers `Start <Day>`;
- the disclosure paragraph is visible without scrolling past the chips;
- nothing overflows horizontally at 320px.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx
git commit -m "feat(home): add days-since line and the muscle-group picker

Home now fetches /exercises/recency alongside /sessions and renders the
picker below the Start button. startWorkout generalises to startDay(dayId)
so the picker reuses the same session-creation path — the 4-day cycle stays
the default entry point and advances normally from a picker-started day."
```

---

## Task 8: Update AGENTS.md status and the changelog

**Files:**
- Modify: `AGENTS.md` (the **Status** section)
- Modify: `docs/CHANGELOG.md`

`AGENTS.md` says to keep **Status** current and move shipped work to `docs/CHANGELOG.md`. This task is documentation only — no tests.

- [ ] **Step 1: Read the current tail of the changelog**

Run: `tail -40 docs/CHANGELOG.md` and match its existing heading style and entry format exactly.

- [ ] **Step 2: Add the changelog entry**

Add this entry, reformatted to match the heading style you just read (the wording is
final; only the heading level and bullet markers should be adapted):

```markdown
## 2026-08-16 — Muscle-group picker + recovery estimate

- **Muscle-group picker on Home.** Seven display groups (Chest, Back, Shoulders, Arms,
  Quads, Hamstrings & Glutes, Calves) collapsed from the plan's 22 raw muscle tags.
  Tapping a group expands it and offers the plan day that trains it most; the 4-day
  cycle stays the default entry point and advances normally from a picker-started day.
- **Days since last workout**, both overall under the header and per muscle group.
- **Recovery estimate.** Exponential stimulus decay from logged training only, rendered
  as a continuous animated ring with a band label — `Fresh` / `Partly recovered (est.)` /
  `Recently trained` — and never as a percentage. Time constants key off movement
  pattern, not muscle size (Dourado 2023); indirect sets count 0.5 (Pelland 2025).
  Nothing fitted, no per-user parameters, no biometrics collected.
- **New endpoint `GET /api/exercises/recency`** — per-exercise last-trained date,
  timestamp, set count, volume and previous-session date, in one query. Read-only and
  additive: **no schema change, so no restore re-drill is required.**
- **Fix:** `Workout.jsx` threw a `TypeError` on a session whose `workout_day` was not one
  of the four plan keys, killing the page before its own unknown-day fallback could
  render.
- Design: `docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md`.
  Evidence review (16 primary sources): `docs/superpowers/research/2026-08-16-recovery-science.md`.
```

- [ ] **Step 3: Update the AGENTS.md Status section**

Update `_Last updated:_`, and record the new test baseline — 49 backend (42 + 7) and the new frontend total from `npm test` output. **Read the actual numbers from the test runs; do not copy the ones in this plan.**

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/CHANGELOG.md
git commit -m "docs: record muscle-group picker and recovery estimate"
```

---

## Deploy (after all tasks, when the user asks)

Not part of the implementation. When the user is ready, follow `AGENTS.md`:

1. Push. Build **on the Mac** — never on the Pi:
   `docker buildx build --pull --platform linux/arm64 --build-arg APP_COMMIT=$(git rev-parse --short HEAD) -t kapekost/workout-tracker:latest --load .`
2. Transfer: `docker save … | gzip | ssh kapekost@192.168.1.170 'gunzip | docker load'` (on-LAN), or the GitHub release-asset path off-LAN.
3. `docker compose up -d` on the Pi.
4. Verify: root returns 200, `/api/health` `version` matches HEAD, `homeassistant` still healthy.

**No pre-deploy `/api/export` snapshot is strictly required** — that step is for schema-changing deploys and this one changes no schema. Taking one anyway costs nothing.
