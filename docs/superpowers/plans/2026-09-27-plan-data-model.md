# AI plan updates, Phase 1 (data model): implementation plan

**Goal:** Move the workout plan from a single hardcoded `workoutPlan.js` import to a per-profile,
DB-backed plan, migrating the existing seeded profile's content in with nothing lost. No AI/export/
ingestion work in this phase — see the parent spec for phases 2-5, filed separately.

**Spec:** [`../specs/2026-09-27-ai-plan-updates-design.md`](../specs/2026-09-27-ai-plan-updates-design.md), §1.

**Depends on:** nothing new. Not destructive per GUARDRAILS — see spec §1.7 for the explicit check.

Two tasks, each its own PR: **1a (backend)** ships and works standing alone (frontend keeps using the
static import, unaffected); **1b (frontend)** depends on 1a's `GET /api/plan` existing in `main`.

---

## Task 1a: Schema, seed, migration, endpoints (backend only)

**Files:** Modify `backend/main.py`; create `backend/plan_seed.py`; create `backend/test_plan.py`.

### Step 1 — `backend/plan_seed.py`

Transcribe `frontend/src/data/workoutPlan.js`'s `PLAN` object into a Python module-level constant
`DEFAULT_PLAN`: a list of 4 day-dicts in the same order as `CYCLE` (`upper_a, lower_a, upper_b,
lower_b`), each `{"day_key": ..., "name": ..., "tag": ..., "icon": ..., "exercises": [...]}`, each
exercise dict `{"exercise_id": ..., "name": ..., "alt": ..., "sets": ..., "reps_low": ...,
"reps_high": ..., "bodyweight": bool, "muscles": [...], "yt_url": ..., "cues": [...]}` — field names
snake_case here (DB column names), even though the JS source and the `GET /api/plan` wire format use
camelCase (`repsLow`/`ytUrl`) — the wire-shape translation happens in Step 4's endpoint, not here.
**Copy every one of the 22 exercises' `cues` verbatim, in order** — this is the "nothing lost" part
of the migration; a transcription slip here is a real content regression, not a style nit. Do not
paraphrase or shorten anything.

### Step 2 — Schema + migration (v6 → v7)

In `backend/main.py`'s `_migrate`, add a `if v < 7:` block per the spec §1.1 DDL exactly
(`plan_days`, `plan_exercises`, the index). Then, in the same block, for every row in `profiles`
that has **zero** `plan_days` rows (`SELECT id FROM profiles WHERE id NOT IN (SELECT DISTINCT
profile_id FROM plan_days)` before any insert happens in this migration run — needed so re-running
init() against an already-migrated DB is a no-op, matching every other `_migrate` block's
idempotency), insert `DEFAULT_PLAN`'s days (with `sort_order` = position in the list) and each day's
exercises (with `sort_order` = position within the day), from `plan_seed.py`. End with
`conn.execute("PRAGMA user_version = 7")`. Add `"plan_days": 7, "plan_exercises": 7` — no, do **not**
add these to `TABLE_INTRODUCED_AT`/`TABLES` this phase (spec §1.1 — deferred to Phase 4's own review,
noted, not decided by omission).

Write the test first: `test_migration_seeds_plan_for_a_profile_with_none` (using the `mainmod`
fixture, which runs `init()` fresh — assert the seeded `kapekost` profile ends up with exactly 4
`plan_days` rows in `upper_a, lower_a, upper_b, lower_b` order and 22 total `plan_exercises` rows,
spot-checking one full exercise's fields, e.g. `bench_press`'s `sets`/`reps_low`/`reps_high`/`cues`
match `plan_seed.DEFAULT_PLAN` exactly) and `test_migration_is_a_noop_for_a_profile_with_existing_rows`
(call `_migrate` a second time against the same connection — row counts unchanged, `updated_at`
values unchanged, proving it doesn't double-insert or touch existing rows).

### Step 3 — `create_profile` seeds a new profile's plan

`backend/main.py:722`'s `create_profile`, right after inserting the new `profiles` row (same
transaction), insert `DEFAULT_PLAN`'s days+exercises for the new `profile_id`, same shape as the
migration backfill (consider factoring the "insert DEFAULT_PLAN for a profile_id" logic into one
small helper both call, rather than duplicating the insert loop — this one's a real, non-speculative
second call site, unlike the module-split call in the parent plan's own "decisions" section, so
factoring it here is justified).

Test: `test_create_profile_seeds_a_starter_plan` — create a profile via the endpoint, assert it has
4 `plan_days` and 22 `plan_exercises` rows immediately.

### Step 4 — `GET /api/plan`

New endpoint, acting-profile-scoped (`acting_profile_id(conn)`), returning the shape in spec §1.5:
`{"plan": {day_key: {...}}, "cycle": [day_key, ...]}`, `cycle` ordered by `plan_days.sort_order`,
each day's `exercises` ordered by `plan_exercises.sort_order`, translating snake_case DB columns to
the camelCase wire fields (`reps_low` → `repsLow`, `reps_high` → `repsHigh`, `yt_url` → `ytUrl`,
`muscles_json`/`cues_json` → parsed JSON arrays `muscles`/`cues`). `bodyweight` as a real bool (SQLite
stores 0/1 — cast it).

Test: `test_get_plan_matches_workoutplan_js_shape_for_seeded_profile` — fetch `/api/plan`, assert
`resp["cycle"] == ["upper_a", "lower_a", "upper_b", "lower_b"]` and `resp["plan"]["upper_a"]`'s
`exercises[0]` has exactly the keys `{id, name, alt, sets, repsLow, repsHigh, bodyweight, muscles,
ytUrl, cues}` (note: `exercise_id` on the wire is `id`, matching `workoutPlan.js`'s own exercise
objects, which use `id` not `exercise_id`) with values matching `plan_seed.DEFAULT_PLAN`'s
`bench_press` entry.

### Step 5 — `SessionIn.workout_day` becomes profile-plan-validated, not a hardcoded `Literal`

Change `SessionIn.workout_day: Literal["upper_a", "lower_a", "upper_b", "lower_b"]` to `workout_day:
str = Field(max_length=64)`. In `create_session`, before inserting, check the acting profile has a
`plan_days` row with that `day_key` — `raise HTTPException(400, f"unknown workout day '{...}'")` if
not.

Tests: `test_create_session_accepts_any_day_in_the_profiles_plan` (still works for all 4 default
days — replaces, don't just supplement, whatever existing test asserted the old Literal's 422
behavior — search `backend/test_main.py`/`backend/test_foundations.py` for an existing test
asserting 422 on a bad `workout_day` and update it to expect 400 with the new message instead, since
the validation now happens in the handler, not at the Pydantic layer); `test_create_session_rejects_a_day_key_not_in_the_profiles_plan`
(a made-up `day_key` → 400, not 500, not a silent insert).

### Step 6 — verify + commit

`cd backend && .venv/bin/python -m pytest -q` (create the venv first if this worktree doesn't have
one yet — see Task 1's own note in the sibling `dynamic-progression` plan for the exact command) —
full suite green, no regressions in existing session/day-validation tests.
```bash
git add backend/main.py backend/plan_seed.py backend/test_plan.py
git commit -m "feat(plan): per-profile, DB-backed workout plan (schema, migration, GET /api/plan)"
```

---

## Task 1b: Frontend cutover to `usePlan()`

**Files:** Create `frontend/src/lib/planContext.jsx`; modify `frontend/src/App.jsx`; modify the 10
non-test consumers of `../data/workoutPlan`'s `PLAN`/`CYCLE`/`getNextWorkoutId` (`DayIcon.jsx`,
`ResumeBanner.jsx`, `MuscleGroupPicker.jsx`, `DayAccent.jsx`, `muscles.js`, `History.jsx`,
`Exercise.jsx`, `PersonalBests.jsx`, `Home.jsx`, `Workout.jsx` — **`workoutPlan.js` itself is not
modified**, per spec §1.3: it stays as the literal content reference and test-fixture source);
update each of those files' own `*.test.*` companion to mock `usePlan()`.

**Depends on:** Task 1a merged to `main` (needs `GET /api/plan` live).

### Step 1 — `planContext.jsx`

Mirror `frontend/src/lib/session.jsx`'s exact shape (read it first): a `PlanContext` with a safe
default (`{plan: {}, cycle: [], ready: true}` — so a component rendered without the provider, e.g. an
unwrapped unit test, degrades to "empty plan" rather than throwing), a `PlanProvider` that fetches
`GET /api/plan` once (gated on `useSession()`'s `profile` being present — no point fetching a plan
for nobody), sets `ready` once the fetch settles (success or failure — mirror `session.jsx`'s own
"only a request that settles sets ready" reasoning and its timeout-fallback pattern if it has one),
and a `usePlan()` hook (`useContext(PlanContext)`).

Test: `frontend/src/lib/planContext.test.jsx` — provider fetches and exposes `plan`/`cycle`;
`usePlan()` outside a provider returns the safe default without throwing.

### Step 2 — Wire into `App.jsx`

Add `<PlanProvider>` inside `<SessionProvider>`, alongside `<ActiveSessionProvider>` (check the
existing nesting order in `App.jsx` and preserve it — `PlanProvider` needs `useSession()` so it must
nest *inside* `SessionProvider`, not outside).

### Step 3 — Swap the 10 consumers, one seam per file

For each file, change `import { PLAN, CYCLE, getNextWorkoutId } from '../data/workoutPlan'` (only
import what that specific file actually used — check each file's own import line) to `import {
usePlan } from '../lib/planContext'` plus `const { plan: PLAN, cycle: CYCLE } = usePlan()` inside the
component/hook body (not at module scope — these are now runtime values, not static constants).
`getNextWorkoutId(sessions)` (currently reads the module-level `CYCLE` closure) needs its `CYCLE`
threaded in as a parameter at its one call site instead, since it can no longer close over a static
import — check `workoutPlan.js` for its exact current signature and call site(s) before changing it.
`muscles.js` (not a component — a plain module doing computation at import time) changes its exports
from module-level constants to functions taking `plan` as a parameter (spec §1.6): `ALL_EXERCISES` →
`allExercises(plan)`, `EXERCISE_BY_ID` → `exerciseById(plan)`; update its own call sites
accordingly. **`DAY_COLORS` keeps being imported directly from `workoutPlan.js` everywhere it's used
today — do not route it through `usePlan()`** (spec §1.3: it's presentation chrome, not plan data,
and never moves).

Do these one file at a time, running `npm test -- <that file's test>` after each, not all 10 at once
— a break is much easier to isolate that way.

### Step 4 — Update each file's tests to mock `usePlan()`

Each consumer's test file currently does `import { PLAN } from '../data/workoutPlan'` directly (real
literal data, no mock). Keep that import (workoutPlan.js is unchanged and still holds the literal
fixture content) but add `vi.mock('../lib/planContext', () => ({ usePlan: () => ({ plan: PLAN,
cycle: CYCLE, ready: true }) }))` (adjust the relative import path per file's location) so the
component under test receives the exact same literal data it always has, just via the mocked hook
instead of a real static import. This should mean **zero changes to any test's actual assertions** —
only the mock wiring changes. If an assertion needs to change anyway, stop and check whether the
component change (not the test) introduced a real behavior difference before "fixing" the test.

### Step 5 — Full verification

`cd frontend && npm test` — every existing test across all touched files passes, plus the new
`planContext.test.jsx` cases. `npm run build` — succeeds.

### Step 6 — Manual smoke render (PLAYBOOK's "look at it rendered" baseline gate)

Run the app locally against the migrated backend (Task 1a's branch merged, or this branch rebased
onto it). Log in as the seeded profile, visit Home, start a workout (Workout.jsx), open History,
open an Exercise detail page, open Personal Bests. Everything should look **identical** to before
this phase — this is a plumbing change, not a visual one. Any visible difference is a bug to find
before opening the PR, not a "known issue" to note in it.

### Step 7 — Commit

```bash
git add frontend/src/lib/planContext.jsx frontend/src/lib/planContext.test.jsx frontend/src/App.jsx \
        frontend/src/components/DayIcon.jsx frontend/src/components/DayIcon.test.jsx \
        frontend/src/components/ResumeBanner.jsx \
        frontend/src/components/MuscleGroupPicker.jsx \
        frontend/src/components/DayAccent.jsx frontend/src/components/DayAccent.test.jsx \
        frontend/src/lib/muscles.js frontend/src/lib/muscles.test.js \
        frontend/src/pages/History.jsx frontend/src/pages/Exercise.jsx \
        frontend/src/pages/PersonalBests.jsx frontend/src/pages/PersonalBests.test.jsx \
        frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx \
        frontend/src/pages/Workout.jsx frontend/src/pages/Workout.test.jsx frontend/src/App.test.jsx
git commit -m "feat(plan): fetch the per-profile plan via usePlan() instead of the static import"
```
(Adjust the file list to whatever actually changed — some listed files may not need a test-mock
change if they don't render anything plan-shaped in their own tests; verify with `git status`
before committing rather than trusting this list blindly.)

---

## Verification checklist (both tasks, before either PR)

- [ ] 1a: full backend suite green, includes every named test above.
- [ ] 1b: full frontend suite green, `npm run build` succeeds, manual smoke render confirmed
  identical to pre-change.
- [ ] `git diff` for 1a touches only `backend/main.py` (the `_migrate`/`create_profile`/
  `create_session`/new-endpoint regions) plus the two new files — nothing near unrelated endpoints.
- [ ] 1b introduces no new visual output — confirmed by the manual smoke pass, not just green tests.
