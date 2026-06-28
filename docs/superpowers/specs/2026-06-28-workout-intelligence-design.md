# Design: Workout Intelligence (previous performance, PRs, overload, notes)

_Date: 2026-06-28_

## Summary

A focused batch of high-impact, low-bloat improvements that make logging faster
and more motivating, building on the already-shipped timer/summary/auto-fill work.
All new history-aware features share one new backend capability: **"the previous
completed workout's sets for an exercise."**

Features (numbered per the user's brief):
- **F1 Previous Performance** — show the last completed workout's sets under an
  exercise during a workout (subtle).
- **F4 PR Detection (expanded)** — at finish, detect highest weight, highest reps
  at a weight, highest estimated 1RM, and highest session volume; show subtly.
- **F6 Progressive Overload Hint** — deterministic next-weight suggestion.
- **F7 Auto-fill (enhanced)** — first-set weight prefills from the previous
  workout's first working set (extends the existing per-exercise prefill).
- **F8 Exercise Notes** — optional per-exercise notes, backend-persisted, shown
  under the title.
- **F3 extras** — rest timer **pause** + **remembered preferred duration**.
- **Polish** — loading skeletons, memoize expensive calcs, no layout shift.

Out of scope: redesign, TypeScript migration (codebase is JS), new deps, AI.

## Context / constraints
- Preserve the current design language; keep components small; reuse existing
  state patterns; no new runtime dependencies.
- Data lives in the FastAPI/SQLite backend (per decision). Reads are cached
  offline by the service worker; writes need the Pi (consistent with today).
- "Completed workout" = `sessions.completed = 1`. The active session is excluded
  from "previous" lookups.

---

## Backend (FastAPI / SQLite)

### Endpoint A — last performance for an exercise
`GET /api/exercises/{exercise_id}/last?exclude_session={id}` →
```json
{ "session_id": 11, "date": "2026-06-20",
  "sets": [ {"set_number":1,"weight_kg":80,"reps":8}, ... ] }
```
or `null` when no prior completed session contains the exercise. Picks the most
recent `completed=1` session (id ≠ `exclude_session`) that has ≥1 set for that
exercise; returns those sets ordered by `set_number`.

### Endpoint B — PRs achieved in a completed session
`GET /api/sessions/{id}/prs` → list of PRs this session set vs ALL prior
completed sessions:
```json
[ {"type":"weight","exercise_name":"Bench Press","value":85,"unit":"kg"},
  {"type":"1rm","exercise_name":"Squat","value":142.5,"unit":"kg"},
  {"type":"volume","exercise_name":null,"value":7320,"unit":"kg"} ]
```
- Per exercise in the session, compare its best-of-this-session to the best over
  all prior completed sessions for: **weight** (max `weight_kg`), **reps@weight**
  (max reps at the session's top weight for that exercise), **1RM** (Epley:
  `weight*(1+reps/30)`, rounded 0.5).
- **volume** = session Σ`weight*reps` vs max prior session volume (one entry,
  `exercise_name: null`).
- Only include a type when this session strictly exceeds the prior best (or no
  prior exists). Pure helper functions, unit-tested.

### Notes (F8)
- New table `exercise_notes(exercise_id TEXT PRIMARY KEY, note TEXT, updated_at)`.
- `GET /api/notes` → `{ exercise_id: note, ... }` (one round-trip for the page).
- `PUT /api/exercises/{exercise_id}/note` body `{ "note": "..." }` upserts;
  empty string deletes the row. Idempotent table creation in `init()`.

All endpoints additive; no change to existing tables (only a new table).

---

## Frontend

### F1 Previous Performance (Workout.jsx)
- When an exercise is expanded, lazily fetch `GET /api/exercises/{id}/last`
  (cache per exercise in component state; one fetch each). Under the title show a
  subtle block: a small "Last workout" label + each set as `80kg × 8`. Hidden
  when no history. Skeleton line while loading.

### F6 Progressive Overload Hint (Workout.jsx)
- Pure helper `overloadSuggestion(lastSets, repsHigh, increment = 2.5)` in
  `frontend/src/lib/overload.js`:
  - If `lastSets` non-empty and **every** set's `reps >= repsHigh`:
    `{ weight: topWeight + increment, hitTarget: true }`.
  - Else `{ weight: topWeight, hitTarget: false }` (repeat last weight); `null`
    if no history.
- Show under the exercise (subtle): "Suggested **{weight}kg** · Target {low}–{high}".

### F7 Auto-fill enhancement (workoutFlow.js)
- Extend `prefillFor` to accept the previous-workout sets: when there are no
  this-session sets, prefill weight/reps from the **previous workout's first
  working set** (if provided) before falling back to progress max / 20×8.
  Keep the existing signature working (new optional arg).

### F4 PR Detection + F5 summary (Workout.jsx)
- On finish, call `GET /api/sessions/{id}/prs` and render the returned PRs in the
  summary (replacing the client-side max-weight-only logic). A subtle one-line
  success message per PR (e.g. "🎉 New PR — Highest Bench Press weight: 85kg").
  No heavy animation.

### F8 Notes (Workout.jsx)
- Fetch `GET /api/notes` on load. Under each exercise title, a small, muted,
  editable note (tap to edit → textarea; blur → `PUT`). Empty shows a faint
  "Add note" affordance. Small typography, no layout shift.

### F3 extras (TimerBar.jsx + a tiny pref hook)
- **Pause/resume**: a Pause button. Pausing snapshots remaining seconds and stops
  the countdown; resume restarts from the snapshot (re-anchor `restStartMs` to
  `now - elapsedBeforePause`). Keep timestamp-derived display.
- **Remembered duration**: persist the user's preferred rest seconds in
  `localStorage` (UI preference, not workout data) via `useRestPreference()`;
  default 90. The ±30 adjustments update the remembered default so the next set
  starts from it.

### Polish & performance
- Loading **skeletons** for History, Workout, Progress (reusable `<Skeleton>`).
- `useMemo` the summary stats and grouped-sets computations; avoid recompute on
  unrelated renders.
- No layout shift: reserve space for the previous-performance/notes blocks.
- Remove any dead code encountered; keep components small.

---

## Testing
- Backend: pytest for Endpoint A (latest completed, excludes active, null case),
  Endpoint B PR logic (each type incl. ties not counting), notes upsert/delete.
- Frontend pure logic: `overloadSuggestion` (all-hit vs not vs no-history) and the
  extended `prefillFor` (previous-first-set path) via Vitest.
- UI wiring verified by build + manual smoke.

## Deploy impact
- Backend gains one table + four endpoints (additive; safe migration). Frontend
  changes only. Same Mac-build → Pi flow; one deploy after this batch + the
  already-merged-locally timer/UX work.
