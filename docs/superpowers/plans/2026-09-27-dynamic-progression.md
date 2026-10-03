# Dynamic progression suggestions: implementation plan

**Goal:** Replace the static "repeat last weight / always show the plan's rep range" defaults with a
time-aware suggestion (starting weight, single rep target, one warm-up set), computed backend-side
and unit-tested, wired into `Workout.jsx`'s existing prefill/hint flow.

**Spec:** [`../specs/2026-09-27-dynamic-progression-design.md`](../specs/2026-09-27-dynamic-progression-design.md)

**Depends on:** nothing new — reuses `sessions`/`sets` and `/api/exercises/{id}/last` as they exist
today. No schema change, not destructive per GUARDRAILS.

---

## Decisions this plan is making (spec left open)

- **Module placement:** `suggest_progression` and `round_to_step` go inline in `backend/main.py`,
  next to `epley()` (same file, same "small pure helper near its one call site" pattern this file
  already uses — `epley` isn't in its own module either, and this repo has no `backend/lib/`-style
  split to break precedent for one more function). A dedicated `backend/progression.py` was
  considered and rejected: it would be one file for two functions with a single call site, which is
  the "answered the wrong question" shape PLAYBOOK's efficiency bar warns against.
- **Test file:** new `backend/test_progression.py` for the pure-function cases (no DB), reusing
  `test_recency.py`'s `_session(client, mainmod, day, exercises, completed, on_date)` helper (moved
  nowhere — imported isn't possible between test files here without a conftest change, so Task 1
  copies the ~14-line helper into the new file, matching this suite's own documented precedent of
  "every test file used to re-declare these" before the fixture consolidation — a second small
  duplication for a *different* helper is consistent with, not a regression of, that same call).
- **Rounding tie-break:** `round_to_step` rounds half **up** (`floor(x/step + 0.5) * step`), not
  Python's default banker's rounding — chosen so `41.25 → 42.5` is deterministic and matches the
  spec's own worked example. Implemented and tested directly, not left to `round()`'s default.

## Task ordering

1. Backend pure logic + its own tests (nothing else depends on anything but this).
2. Endpoint wiring (depends on 1).
3. Frontend prefill + UI (depends on 2's response shape).
4. UI/UX review gate + fixes (depends on 3 being renderable).

---

### Task 1: `suggest_progression` + `round_to_step`, backend pure logic

**Files:** Modify `backend/main.py` (add near `epley()`, `backend/main.py:975`); create
`backend/test_progression.py`.

- [ ] Step 1: Add `round_to_step(x: float, step: float = 2.5) -> float` — `max(0.0,
  math.floor(x / step + 0.5) * step)`. Import `math` at the top of `main.py` if not already present.
- [ ] Step 2: Write failing tests first in `backend/test_progression.py` (no fixtures needed for
  these — plain function calls):
  - `test_round_to_step_exact_half_rounds_up` — `round_to_step(41.25) == 42.5`.
  - `test_round_to_step_floors_at_zero` — `round_to_step(-5) == 0`.
  - `test_no_history_returns_static_default` — `days_since=None` → `weight_kg=20, reps=reps_low,
    warmup=None, hit_status=None, layoff_band="none"`; same call with `bodyweight=True` →
    `weight_kg=0`.
  - `test_recent_clean_hit_progresses` — 3 sets `{80, 8}` × 3, `reps_low=6, reps_high=8,
    days_since=3` → `weight_kg=82.5, reps=6, hit_status="clean", layoff_band="recent"`, warmup
    `{weight_kg: 42.5, reps: 10}` (`8+2` capped at 15 → 10).
  - `test_recent_partial_hit_holds_weight_targets_top_of_range` — sets `reps=[7,6,6]`,
    `reps_low=6, reps_high=10, days_since=3` → `weight_kg` unchanged (repeat), `reps=10`,
    `hit_status="partial"`.
  - `test_recent_missed_holds_weight_targets_bottom_of_range` — sets `reps=[5,6,6]`,
    `reps_low=6, reps_high=10, days_since=3` → weight repeat, `reps=6`, `hit_status="missed"`.
  - `test_short_layoff_holds_flat_even_on_clean_hit` — same clean-hit sets as above,
    `days_since=14` and `days_since=27` (both boundaries) → weight **unchanged** (no `+increment`),
    `reps=reps_high`, `layoff_band="short"`.
  - `test_moderate_layoff_reduces_regardless_of_hit_status` — clean-hit sets, `days_since=28` and
    `days_since=56` → `weight_kg == round_to_step(top_weight * 0.9)`, `reps=reps_low`,
    `layoff_band="moderate"`.
  - `test_long_layoff_reduces_further` — `days_since=57` → `weight_kg == round_to_step(top_weight *
    0.8)`, `reps=reps_low`, `layoff_band="long"`.
  - `test_warmup_is_null_for_bodyweight_with_zero_working_weight` — no history, `bodyweight=True`
    → `warmup is None` (covered by the no-history case too, but assert explicitly here since it's
    the case the spec calls out by name).
  - `test_warmup_reps_capped_at_fifteen` — `reps_high=15` (mirrors the real `tricep_pushdown`
    exercise's own range) → `warmup["reps"] == 15`, not `17`.
- [ ] Step 3: Implement `suggest_progression(last_sets, reps_low, reps_high, days_since,
  increment=2.5, bodyweight=False) -> dict` per spec §2.1–§2.4, until the whole file's tests pass.
  Compute `top_weight = max(s["weight_kg"] for s in last_sets)` once and reuse it for both the
  working-weight and warm-up math.
- [ ] Step 4: `cd backend && .venv/bin/python -m pytest -q test_progression.py` → all new tests
  green. Then the full `.venv/bin/python -m pytest -q` → no regressions elsewhere.
- [ ] Step 5: Commit
```bash
git add backend/main.py backend/test_progression.py
git commit -m "feat(progression): add suggest_progression heuristic (weight, reps, warm-up)"
```

### Task 2: Wire `suggest_progression` into `/api/exercises/{exercise_id}/last`

**Files:** Modify `backend/main.py` (`last_performance`, `backend/main.py:978`); extend
`backend/test_progression.py` with endpoint-level cases.

- [ ] Step 1: Add optional query params to `last_performance`: `reps_low: int | None = None,
  reps_high: int | None = None, bodyweight: bool = False`.
- [ ] Step 2: Write failing tests first (copy `test_recency.py`'s `_session` helper into
  `test_progression.py`, per the plan-level decision above):
  - `test_last_endpoint_includes_suggestion_when_reps_params_given` — one completed session 3 days
    ago, request with `reps_low`/`reps_high` set → response has a populated `suggestion` matching
    `suggest_progression`'s own contract.
  - `test_last_endpoint_omits_suggestion_when_reps_params_absent` — same session, no `reps_low`/
    `reps_high` in the query string → response has **no** `suggestion` key, and is otherwise
    byte-for-byte what today's endpoint already returns (the backward-compat case, spec §3.2) —
    assert the exact existing keys (`session_id`, `date`, `sets`) and nothing else changes shape.
  - `test_last_endpoint_returns_null_unchanged_with_no_history` — no session at all, with
    `reps_low`/`reps_high` given → still returns `null` (proves the enrichment never fires on the
    already-existing null path).
- [ ] Step 3: Implement: after loading `row`/`sets` exactly as today, if `reps_low is not None and
  reps_high is not None`, compute `days_since = (date.today() -
  date.fromisoformat(row["date"])).days` (import `date` from `datetime` — `datetime` itself is
  already imported) and attach `"suggestion": suggest_progression(sets_as_dicts, reps_low, reps_high,
  days_since, bodyweight=bodyweight)` to the returned dict. Leave the `null`-history branch
  untouched.
- [ ] Step 4: `.venv/bin/python -m pytest -q` → full suite green.
- [ ] Step 5: Commit
```bash
git add backend/main.py backend/test_progression.py
git commit -m "feat(progression): enrich /api/exercises/{id}/last with a suggestion"
```

### Task 3: Frontend — prefill from the suggestion, show the warm-up line

**Files:** Modify `frontend/src/lib/workoutFlow.js`, `frontend/src/pages/Workout.jsx`; extend
`frontend/src/lib/workoutFlow.test.js`.

- [ ] Step 1: Write failing tests first in `workoutFlow.test.js`:
  - `prefillFor uses the backend suggestion when present` — `lastSets` data shaped as
    `{sets: [...], suggestion: {weight_kg: 82.5, reps: 6}}` → `prefillFor` returns `{weight: 82.5,
    reps: 6}`, ignoring whatever `overloadSuggestion` would have computed from the raw sets.
  - `prefillFor falls back to overloadSuggestion when suggestion is absent` — same shape but no
    `suggestion` key → today's existing behavior, unchanged (reuse an existing case's expected
    values from `overload.test.js` as the oracle).
- [ ] Step 2: Implement in `prefillFor` (`workoutFlow.js:11`): change the `lastSets` parameter
  handling so when the caller passes the full `/last` response object (not just its `.sets` array)
  and it carries a `.suggestion`, prefer `{weight: suggestion.weight_kg, reps: suggestion.reps}`
  before falling into the existing `overloadSuggestion` branch. Keep the function's existing
  signature call-compatible — the three call sites in `Workout.jsx` already pass `data` (the whole
  `/last` response) as the `lastSets` argument today (re-check: currently they pass `data?.sets`,
  per `Workout.jsx:228/317/436` — this step must change those three call sites to pass `data` itself,
  and `prefillFor` internally reads `.sets` off it, since the suggestion lives one level up from the
  sets array in the response).
- [ ] Step 3: Update `ensureLastPerf` (`Workout.jsx:183`) to accept the exercise object (not just
  `exId`) and append `reps_low`/`reps_high`/`bodyweight` to the query string; update its three call
  sites (`Workout.jsx:226`, `316`, `435`) to pass the exercise object they already have in scope at
  each site.
- [ ] Step 4: Add the warm-up line in the "Last workout" block (`Workout.jsx:493-507`): render
  `Warm-up: **{warmup.weight_kg}kg** × {warmup.reps}` above the existing "Suggested" line when
  `lastPerf[ex.id].suggestion?.warmup` is present; change the "Suggested" line's copy to `Suggested
  **{weight}kg** × **{reps}**` reading from `lastPerf[ex.id].suggestion` when present, falling back
  to today's `overloadSuggestion(...)` call when it's absent (mirrors the `prefillFor` fallback —
  never remove the existing render path, only prefer the new one).
- [ ] Step 5: `cd frontend && npm test` → all green (including the two new cases and every existing
  `overload.test.js`/`workoutFlow.test.js` case, unchanged). `npm run build` → succeeds.
- [ ] Step 6: Commit
```bash
git add frontend/src/lib/workoutFlow.js frontend/src/lib/workoutFlow.test.js frontend/src/pages/Workout.jsx
git commit -m "feat(progression): prefill + display the backend's suggestion in Workout.jsx"
```

### Task 4: UI/UX review gate

**Files:** none (review-only task; any fix it finds becomes a small follow-up commit on this branch,
not a new task).

- [ ] Step 1: Run the app locally (`backend/.venv/bin/python -m uvicorn main:app --reload` +
  `frontend && npm run dev`), seed a profile with at least: one exercise with no history, one with a
  recent clean-hit session, one with a session 20+ days old, and one bodyweight exercise.
- [ ] Step 2: Screenshot each of the four states (card expanded, warm-up + suggested line visible or
  correctly absent for the no-history case).
- [ ] Step 3: Dispatch a UI-expert review and a UX-expert review (two separate passes, per PLAYBOOK
  step 5) against the four screenshots. Ask the UI pass about hierarchy/spacing/color consistency of
  the new line against the existing "Last workout" block; ask the UX pass whether "Warm-up" vs.
  "Suggested" reads unambiguously at a glance, one-handed, mid-set.
- [ ] Step 4: Adjudicate every finding against actual source/a fresh screenshot before acting on it
  — per PLAYBOOK step 5's standing warning (screenshot-only review has produced false "Critical"
  findings twice already in this project, #152). Fix anything real in a follow-up commit on this
  same branch; log anything cosmetic-but-real as a note in the PR description rather than blocking
  on it.

---

## Verification checklist (before opening the PR)

- [ ] `backend/.venv/bin/python -m pytest -q` — full suite green, includes all `test_progression.py`
  cases from Tasks 1–2.
- [ ] `frontend && npm test` — full suite green, includes new `workoutFlow.test.js` cases.
- [ ] `frontend && npm run build` — succeeds.
- [ ] Manual render: all four states from Task 4 look right in a real browser, not just in test
  assertions.
- [ ] No schema change touched `_migrate`/`TABLES`/`TABLE_INTRODUCED_AT` — confirm `git diff
  backend/main.py` shows only the two additions from Tasks 1–2, nothing near `_migrate`.
