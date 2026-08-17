# Manual historical Personal Bests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner manually log a historical Personal Best (an exercise + weight + reps + rough year, from before they started using this app) and have it count as the bar to beat in today's actual workout.

**Architecture:** A new `personal_bests` table (schema v3), consulted by exactly two existing read paths — `session_prs` (the Finish-summary PR/baseline comparison) and `Workout.jsx`'s live-PR-toast/prefill seed — plus a new, fully separate CRUD surface (`/api/personal-bests`) and a dedicated `/personal-bests` page. `/api/progress`, the Progress chart, History, and the recovery model are all deliberately untouched.

**Tech Stack:** FastAPI + `sqlite3` (backend, Python), React + react-router-dom (frontend, JS), pytest (backend tests), vitest + @testing-library/react (frontend tests).

**Spec:** [`../specs/2026-08-17-personal-bests-design.md`](../specs/2026-08-17-personal-bests-design.md)

## Global Constraints

- TDD throughout: write the failing test first, watch it fail, then implement.
- Weight is kg only — no unit field, no conversion (spec §4, "Out").
- No styling approach beyond the existing inline-`style={{}}` + `.card`/`.tap-target`/`.btn-primary` utility classes — no new component library, no CSS-in-JS (spec §4).
- No `profile_id`/ownership placeholder anywhere in this work (spec §5).
- Backend: run tests with `.venv/bin/python -m pytest` from `backend/` (see `AGENTS.md` for the exact non-interactive path — nothing is on `PATH`).
- Frontend: run tests with `npm test` (`vitest run`) from `frontend/`.
- This is a schema migration. Per `AGENTS.md`, a pre-deploy `/api/export` snapshot is mandatory and a restore drill is required afterward — this is a deploy-time step, not a coding task; noted again at the end of this plan.

---

### Task 1: `personal_bests` table — schema migration v3

**Files:**
- Modify: `backend/main.py:42-64` (`_migrate`)
- Test: Create `backend/test_personal_bests.py`

**Interfaces:**
- Produces: a `personal_bests` SQLite table — columns `id INTEGER PRIMARY KEY AUTOINCREMENT`, `exercise_id TEXT NOT NULL`, `exercise_name TEXT NOT NULL`, `weight_kg REAL NOT NULL`, `reps INTEGER NOT NULL`, `achieved_year INTEGER NOT NULL`, `achieved_note TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `UNIQUE(exercise_id, weight_kg, reps, achieved_year)`. `PRAGMA user_version` reaches 3.

- [ ] **Step 1: Write the failing migration test**

Create `backend/test_personal_bests.py`:

```python
def test_migration_creates_personal_bests_table(mainmod):
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
        cols = {r[1] for r in conn.execute("PRAGMA table_info(personal_bests)").fetchall()}
        assert cols == {"id", "exercise_id", "exercise_name", "weight_kg", "reps",
                         "achieved_year", "achieved_note", "created_at"}

def test_migration_is_idempotent(mainmod):
    mainmod.init(); mainmod.init()  # second run must not error
    with mainmod.db() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: FAIL — `sqlite3.OperationalError: no such table: personal_bests` (or `user_version == 3` assertion fails).

- [ ] **Step 3: Add the v3 migration block**

In `backend/main.py`, in `_migrate` (after the existing `if v < 2:` block, `backend/main.py:64`):

```python
    # --- v2 -> v3: manual historical Personal Bests ---
    if v < 3:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS personal_bests (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_id   TEXT NOT NULL,
                exercise_name TEXT NOT NULL,
                weight_kg     REAL NOT NULL,
                reps          INTEGER NOT NULL,
                achieved_year INTEGER NOT NULL,
                achieved_note TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(exercise_id, weight_kg, reps, achieved_year)
            )
        """)
        conn.execute("PRAGMA user_version = 3")
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_personal_bests.py
git commit -m "feat(personal-bests): add personal_bests table (schema v3)"
```

---

### Task 2: `POST` / `GET` / `DELETE` `/api/personal-bests`

**Files:**
- Modify: `backend/main.py` — add `PersonalBestIn` model near the other models (`backend/main.py:98-126`); add the three endpoints after `delete_set` (`backend/main.py:216-221`, before `get_progress` at `:223`)
- Test: `backend/test_personal_bests.py`

**Interfaces:**
- Consumes: `personal_bests` table (Task 1).
- Produces: `POST /api/personal-bests` (body: `exercise_id, exercise_name, weight_kg, reps, achieved_year, achieved_note?`; returns the inserted row incl. `id`; 409 on a duplicate `(exercise_id, weight_kg, reps, achieved_year)`), `GET /api/personal-bests` (returns `list[row]`, ordered by `exercise_name, weight_kg DESC`), `DELETE /api/personal-bests/{id}` (returns `{"deleted": True}` unconditionally).

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_personal_bests.py`:

```python
def _pb(exercise_id="bench_press", exercise_name="Bench Press", weight_kg=100.0, reps=3, achieved_year=2023, achieved_note=None):
    return {"exercise_id": exercise_id, "exercise_name": exercise_name, "weight_kg": weight_kg,
            "reps": reps, "achieved_year": achieved_year, "achieved_note": achieved_note}

def test_create_personal_best_returns_row_with_id(client):
    r = client.post("/api/personal-bests", json=_pb())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] is not None
    assert body["exercise_id"] == "bench_press" and body["weight_kg"] == 100.0

def test_create_rejects_future_year(client):
    r = client.post("/api/personal-bests", json=_pb(achieved_year=2099))
    assert r.status_code == 422

def test_create_rejects_out_of_range_weight(client):
    assert client.post("/api/personal-bests", json=_pb(weight_kg=-5)).status_code == 422
    assert client.post("/api/personal-bests", json=_pb(weight_kg=5000)).status_code == 422

def test_duplicate_personal_best_is_409(client):
    client.post("/api/personal-bests", json=_pb())
    r = client.post("/api/personal-bests", json=_pb())
    assert r.status_code == 409

def test_list_personal_bests_orders_by_name_then_weight_desc(client):
    client.post("/api/personal-bests", json=_pb(exercise_name="Squat", exercise_id="back_squat", weight_kg=140, achieved_year=2022))
    client.post("/api/personal-bests", json=_pb(exercise_name="Bench Press", weight_kg=100, achieved_year=2023))
    client.post("/api/personal-bests", json=_pb(exercise_name="Bench Press", weight_kg=110, reps=1, achieved_year=2021))
    rows = client.get("/api/personal-bests").json()
    names_weights = [(r["exercise_name"], r["weight_kg"]) for r in rows]
    assert names_weights == [("Bench Press", 110), ("Bench Press", 100), ("Squat", 140)]

def test_delete_personal_best_removes_it(client):
    pb_id = client.post("/api/personal-bests", json=_pb()).json()["id"]
    assert client.delete(f"/api/personal-bests/{pb_id}").json() == {"deleted": True}
    assert client.get("/api/personal-bests").json() == []

def test_delete_nonexistent_personal_best_still_returns_deleted_true(client):
    assert client.delete("/api/personal-bests/999").json() == {"deleted": True}
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: FAIL — `404 Not Found` on the new routes (they don't exist yet).

- [ ] **Step 3: Add the model and endpoints**

In `backend/main.py`, add near the other models (after `ImportIn`, `backend/main.py:123-126`; needs `field_validator` added to the existing `from pydantic import BaseModel, Field` import):

```python
from pydantic import BaseModel, Field, field_validator
```

```python
class PersonalBestIn(BaseModel):
    exercise_id: str = Field(max_length=64)
    exercise_name: str = Field(max_length=128)
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(ge=1, le=100)
    achieved_year: int = Field(ge=1900)
    achieved_note: Optional[str] = Field(default=None, max_length=200)

    @field_validator("achieved_year")
    @classmethod
    def year_not_in_future(cls, v):
        if v > datetime.now().year:
            raise ValueError("achieved_year cannot be in the future")
        return v
```

Add the endpoints after `delete_set` (`backend/main.py:216-221`):

```python
@app.post("/api/personal-bests")
def create_personal_best(pb: PersonalBestIn):
    with db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO personal_bests (exercise_id, exercise_name, weight_kg, reps, achieved_year, achieved_note) "
                "VALUES (?,?,?,?,?,?)",
                (pb.exercise_id, pb.exercise_name, pb.weight_kg, pb.reps, pb.achieved_year, pb.achieved_note))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "a personal best with this exercise, weight, reps and year already exists")
        conn.commit()
        row = conn.execute("SELECT * FROM personal_bests WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

@app.get("/api/personal-bests")
def list_personal_bests():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM personal_bests ORDER BY exercise_name, weight_kg DESC").fetchall()
        return [dict(r) for r in rows]

@app.delete("/api/personal-bests/{pb_id}")
def delete_personal_best(pb_id: int):
    with db() as conn:
        conn.execute("DELETE FROM personal_bests WHERE id = ?", (pb_id,))
        conn.commit()
        return {"deleted": True}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS, no prior test broken.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_personal_bests.py
git commit -m "feat(personal-bests): CRUD endpoints for /api/personal-bests"
```

---

### Task 3: Wire personal bests into `session_prs` (PR + baseline comparison)

**Files:**
- Modify: `backend/main.py:342-344` (`session_prs`)
- Test: `backend/test_personal_bests.py`

**Interfaces:**
- Consumes: `personal_bests` table (Task 1) directly via SQL (does not go through the Task 2 endpoints).
- Produces: `GET /api/sessions/{sid}/prs` now treats any row in `personal_bests` for an exercise as prior history — suppresses `baseline`, and participates in the `weight`/`reps`/`1rm` comparisons exactly like a real prior completed set. Session-level `volume` is untouched (a PB has no session to sum).

- [ ] **Step 1: Write the failing tests**

Append to `backend/test_personal_bests.py` (uses the `_log_session` helper pattern already established in `backend/test_main.py:26-34` — redefine locally since these test files don't share helpers):

```python
def _log_session(client, day, sets):
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (eid, ename, reps, w) in enumerate(sets, start=1):
        client.post(f"/api/sessions/{sid}/sets", json={
            "exercise_id": eid, "exercise_name": ename,
            "set_number": i, "reps": reps, "weight_kg": w})
    client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_pb_with_no_session_history_suppresses_baseline(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "baseline" not in types
    assert "weight" not in types  # 60kg does not beat the 100kg PB

def test_session_beating_pb_gives_weight_pr(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 5, 105.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    weight = next(p for p in prs if p["type"] == "weight")
    assert weight["value"] == 105.0

def test_pb_reps_and_1rm_participate_in_comparison(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    # Same top weight as the PB, more reps than the PB's 3 -> reps PR
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 5, 100.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = [p["type"] for p in prs]
    assert "reps" in types and "1rm" in types

def test_pb_does_not_affect_volume_pr(client):
    client.post("/api/personal-bests", json=_pb(weight_kg=100, reps=3, achieved_year=2023))
    sid = _log_session(client, "upper_a", [("bench_press", "Bench Press", 8, 60.0)])
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    assert "volume" not in [p["type"] for p in prs]  # first-ever completed session: no volume PR either way
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: FAIL on `test_pb_with_no_session_history_suppresses_baseline` and `test_session_beating_pb_gives_weight_pr` and `test_pb_reps_and_1rm_participate_in_comparison` — `baseline` is currently emitted since `personal_bests` isn't consulted yet.

- [ ] **Step 3: Union `personal_bests` into `prior`**

In `backend/main.py`, in `session_prs` (`backend/main.py:342-344`):

```python
        prior = conn.execute(
            "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
            "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ?", (sid,)).fetchall()
        pb_rows = conn.execute(
            "SELECT exercise_id, weight_kg, reps FROM personal_bests").fetchall()
        prior = list(prior) + list(pb_rows)
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_personal_bests.py -v`
Expected: PASS (13 tests).

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS — in particular `backend/test_main.py`'s existing baseline tests (`test_first_ever_exercise_is_baseline_not_pr` etc.) must still pass since they don't create any `personal_bests` rows.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_personal_bests.py
git commit -m "feat(personal-bests): count historical PBs in the PR/baseline comparison"
```

---

### Task 4: Export/import registration

**Files:**
- Modify: `backend/main.py:10` (`TABLES`), `:15` (`TABLE_INTRODUCED_AT`)
- Modify: `backend/test_foundations.py:88-89` (the two assertions the new table breaks)
- Test: `backend/test_personal_bests.py`

**Interfaces:**
- Consumes: `personal_bests` table (Task 1). `/api/export` and `/api/import` (`backend/main.py:402-465`) are already fully generic over `TABLES` — no other code changes.
- Produces: `/api/export`'s envelope includes a `"personal_bests"` key; `/api/import` accepts both old envelopes (no `personal_bests` key, `schema_version <= 2`) and new ones.

- [ ] **Step 1: Write the failing tests**

Update the two assertions in `backend/test_foundations.py`:

```python
def test_export_envelope_shape(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    client.post(f"/api/sessions/{sid}/sets",
                json={"exercise_id": "bench_press", "exercise_name": "Bench",
                      "set_number": 1, "reps": 8, "weight_kg": 80})
    exp = client.get("/api/export").json()
    assert set(exp["tables"].keys()) == {"sessions", "sets", "exercise_notes", "events", "personal_bests"}
    assert exp["schema_version"] == 3
    assert exp["exported_at"].endswith("Z")
    assert len(exp["tables"]["sessions"]) == 1 and len(exp["tables"]["sets"]) == 1
```

(This is `backend/test_foundations.py:82-91` — replace the body; only the two asserted lines actually change.)

Append to `backend/test_personal_bests.py`:

```python
def test_export_includes_personal_bests(client):
    client.post("/api/personal-bests", json=_pb())
    exp = client.get("/api/export").json()
    assert len(exp["tables"]["personal_bests"]) == 1
    assert exp["tables"]["personal_bests"][0]["exercise_id"] == "bench_press"

def test_old_v2_envelope_without_personal_bests_still_imports(client):
    # Simulates a backup taken before this feature existed.
    old_envelope = {
        "exported_at": "2026-08-01T00:00:00Z",
        "schema_version": 2,
        "tables": {"sessions": [], "sets": [], "exercise_notes": [], "events": []},
    }
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": old_envelope})
    assert r.status_code == 200

def test_personal_bests_round_trips_through_export_import(client):
    client.post("/api/personal-bests", json=_pb())
    envelope = client.get("/api/export").json()
    r = client.post("/api/import", json={"mode": "replace", "confirm": True, "envelope": envelope})
    assert r.status_code == 200
    again = client.get("/api/export").json()
    assert again["tables"]["personal_bests"] == envelope["tables"]["personal_bests"]
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && .venv/bin/python -m pytest test_foundations.py test_personal_bests.py -v`
Expected: FAIL — `exp["tables"].keys()` doesn't include `"personal_bests"`, `schema_version` is still 2.

- [ ] **Step 3: Register the table**

In `backend/main.py`:

```python
TABLES = ["sessions", "sets", "exercise_notes", "events", "personal_bests"]
```

```python
TABLE_INTRODUCED_AT = {"sessions": 0, "sets": 0, "exercise_notes": 0, "events": 2, "personal_bests": 3}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd backend && .venv/bin/python -m pytest test_foundations.py test_personal_bests.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && .venv/bin/python -m pytest -v`
Expected: PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/test_foundations.py backend/test_personal_bests.py
git commit -m "feat(personal-bests): register personal_bests with export/import"
```

---

### Task 5: Flattened exercise catalog for the entry-form picker

**Files:**
- Modify: `frontend/src/data/workoutPlan.js` (append after `DAY_COLORS`, currently ending at `frontend/src/data/workoutPlan.js:332`)
- Test: Create `frontend/src/data/workoutPlan.test.js`

**Interfaces:**
- Produces: `ALL_EXERCISES` — a `{ id: string, name: string }[]`, one entry per unique exercise `id` across every day in `PLAN`, sorted alphabetically by `name`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/data/workoutPlan.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PLAN, ALL_EXERCISES } from './workoutPlan'

describe('ALL_EXERCISES', () => {
  it('has exactly one entry per unique exercise id across all days', () => {
    const idsInPlan = new Set(Object.values(PLAN).flatMap(day => day.exercises.map(e => e.id)))
    expect(ALL_EXERCISES.map(e => e.id).sort()).toEqual([...idsInPlan].sort())
  })

  it('includes exercises from every day, not just the first', () => {
    const ids = ALL_EXERCISES.map(e => e.id)
    expect(ids).toContain('bench_press')  // upper_a
    expect(ids).toContain('back_squat')   // lower_a
    expect(ids).toContain('pullup')       // upper_b
    expect(ids).toContain('deadlift')     // lower_b
  })

  it('is sorted alphabetically by name', () => {
    const names = ALL_EXERCISES.map(e => e.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd frontend && npm test -- workoutPlan.test.js`
Expected: FAIL — `ALL_EXERCISES` is not exported.

- [ ] **Step 3: Add the export**

Append to `frontend/src/data/workoutPlan.js` (after `DAY_COLORS`):

```js
export const ALL_EXERCISES = Object.values(PLAN)
  .flatMap(day => day.exercises)
  .filter((ex, i, arr) => arr.findIndex(e => e.id === ex.id) === i)
  .map(ex => ({ id: ex.id, name: ex.name }))
  .sort((a, b) => a.name.localeCompare(b.name))
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `cd frontend && npm test -- workoutPlan.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/workoutPlan.js frontend/src/data/workoutPlan.test.js
git commit -m "feat(personal-bests): flattened ALL_EXERCISES catalog"
```

---

### Task 6: `PersonalBests` page, route, and Progress entry point

**Files:**
- Create: `frontend/src/pages/PersonalBests.jsx`
- Create: `frontend/src/pages/PersonalBests.test.jsx`
- Modify: `frontend/src/App.jsx` (add route)
- Modify: `frontend/src/pages/Progress.jsx:44-47` (header — add the entry-point button)

**Interfaces:**
- Consumes: `ALL_EXERCISES` (Task 5); `GET /api/personal-bests`, `POST /api/personal-bests`, `DELETE /api/personal-bests/{id}` (Task 2).
- Produces: default-exported `PersonalBests` component; route `/personal-bests`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/PersonalBests.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonalBests from './PersonalBests'

vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import { api } from '../api'

function renderPage() {
  return render(<MemoryRouter><PersonalBests /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('PersonalBests page', () => {
  it('lists existing entries grouped by exercise', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    renderPage()
    await screen.findByText('Bench Press')
    expect(screen.getByText('100kg × 3')).toBeInTheDocument()
  })

  it('shows an empty state with no entries', async () => {
    api.get.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No historical PBs logged yet.')).toBeInTheDocument()
  })

  it('submitting the form posts and appends the new entry', async () => {
    api.get.mockResolvedValue([])
    api.post.mockResolvedValue({
      id: 2, exercise_id: 'bench_press', exercise_name: 'Bench Press',
      weight_kg: 120, reps: 1, achieved_year: 2021, achieved_note: null,
    })
    renderPage()
    await screen.findByText('No historical PBs logged yet.')
    fireEvent.click(screen.getByRole('button', { name: /add personal best/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    await screen.findByText('120kg × 1')
  })

  it('delete removes the entry from the list', async () => {
    api.get.mockResolvedValue([
      { id: 1, exercise_id: 'bench_press', exercise_name: 'Bench Press',
        weight_kg: 100, reps: 3, achieved_year: 2023, achieved_note: null },
    ])
    api.delete.mockResolvedValue({ deleted: true })
    renderPage()
    await screen.findByText('100kg × 3')
    fireEvent.click(screen.getByRole('button', { name: 'delete personal best 1' }))
    await waitFor(() => expect(screen.queryByText('100kg × 3')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd frontend && npm test -- PersonalBests.test.jsx`
Expected: FAIL — `./PersonalBests` does not exist.

- [ ] **Step 3: Create the page component**

Create `frontend/src/pages/PersonalBests.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ALL_EXERCISES } from '../data/workoutPlan'
import Skeleton from '../components/Skeleton'

const labelStyle = {
  display: 'block', color: '#9ca3af', fontSize: '0.7rem', fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
}
const fieldStyle = {
  width: '100%', background: '#1e1e32', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 8px', fontSize: '0.9rem',
}

export default function PersonalBests() {
  const nav = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [exerciseId, setExerciseId] = useState(ALL_EXERCISES[0]?.id ?? '')
  const [weight, setWeight] = useState(20)
  const [reps, setReps] = useState(1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    api.get('/personal-bests').then(d => { setEntries(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  async function submit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const exercise = ALL_EXERCISES.find(ex => ex.id === exerciseId)
    try {
      const created = await api.post('/personal-bests', {
        exercise_id: exerciseId, exercise_name: exercise.name,
        weight_kg: weight, reps, achieved_year: year,
        achieved_note: note.trim() || null,
      })
      setEntries(prev => [...prev, created])
      setNote('')
    } catch {
      showToast('Failed to save — check the values and try again')
    }
    setSaving(false)
  }

  async function remove(id) {
    try {
      await api.delete(`/personal-bests/${id}`)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      showToast('Failed to delete')
    }
  }

  const grouped = entries.reduce((acc, e) => {
    (acc[e.exercise_name] ??= []).push(e)
    return acc
  }, {})

  return (
    <div style={{ paddingTop: 16 }}>
      {toast && <div className="toast error">{toast}</div>}
      <button className="tap-target" onClick={() => nav('/progress')}
        style={{ background: 'none', border: 'none', color: '#6ee7b7', fontSize: '0.8rem',
          fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← Progress
      </button>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>Personal Bests</h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 20 }}>
        Historical PBs from before you started logging here
      </p>

      <form onSubmit={submit} className="card" style={{ padding: 16, marginBottom: 24 }}>
        <label style={labelStyle}>Exercise</label>
        <select value={exerciseId} onChange={e => setExerciseId(e.target.value)}
          style={{ ...fieldStyle, marginBottom: 14 }}>
          {ALL_EXERCISES.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Weight (kg)</label>
            <input type="number" inputMode="decimal" value={weight}
              onChange={e => setWeight(parseFloat(e.target.value) || 0)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Reps</label>
            <input type="number" inputMode="numeric" value={reps}
              onChange={e => setReps(parseInt(e.target.value, 10) || 1)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Year</label>
            <input type="number" inputMode="numeric" value={year}
              onChange={e => setYear(parseInt(e.target.value, 10) || year)}
              style={{ ...fieldStyle, width: '100%' }} />
          </div>
        </div>

        <label style={labelStyle}>Note (optional)</label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Fall, gym PR meet"
          style={{ ...fieldStyle, marginBottom: 16 }} />

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : '+ Add Personal Best'}
        </button>
      </form>

      {loading ? (
        <Skeleton height={72} />
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#6b7280' }}>No historical PBs logged yet.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([name, rows]) => (
          <div key={name} className="card" style={{ padding: '14px 16px', marginBottom: 10 }}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>{name}</p>
            {rows.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1e1e32' }}>
                <span className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24' }}>
                  {r.weight_kg}kg × {r.reps}
                </span>
                <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  {r.achieved_year}{r.achieved_note ? ` · ${r.achieved_note}` : ''}
                </span>
                <button className="tap-target" onClick={() => remove(r.id)}
                  aria-label={`delete personal best ${r.id}`}
                  style={{ background: 'none', border: 'none', color: '#9ca3af',
                    cursor: 'pointer', fontSize: '1rem' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire the route**

In `frontend/src/App.jsx`, add the import (after `import History from './pages/History'`, `frontend/src/App.jsx:6`):

```jsx
import PersonalBests from './pages/PersonalBests'
```

Add the route (after `<Route path="/history" element={<History />} />`, `frontend/src/App.jsx:29`):

```jsx
              <Route path="/personal-bests" element={<PersonalBests />} />
```

- [ ] **Step 5: Add the entry point on the Progress page**

In `frontend/src/pages/Progress.jsx`, add the import:

```jsx
import { useNavigate } from 'react-router-dom'
```

Add `const nav = useNavigate()` inside `export default function Progress() {` (after the existing `useState` declarations, `frontend/src/pages/Progress.jsx:25`).

Replace the header block (`frontend/src/pages/Progress.jsx:45-47`):

```jsx
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>Progress</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Max weight per session</p>
        </div>
        <button className="tap-target" onClick={() => nav('/personal-bests')}
          style={{ background: 'none', border: '1px solid #1e1e32', borderRadius: 100, color: '#6ee7b7',
            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: '7px 14px', whiteSpace: 'nowrap' }}>
          🏆 PBs
        </button>
      </div>
```

- [ ] **Step 6: Run it, confirm it passes**

Run: `cd frontend && npm test -- PersonalBests.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full frontend suite to check for regressions**

Run: `cd frontend && npm test`
Expected: PASS, no prior test broken (Progress.jsx has no existing test file to update).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PersonalBests.jsx frontend/src/pages/PersonalBests.test.jsx frontend/src/App.jsx frontend/src/pages/Progress.jsx
git commit -m "feat(personal-bests): add Personal Bests page, route, and Progress entry point"
```

---

### Task 7: Historical PBs count in the live workout — toast + prefill

**Files:**
- Modify: `frontend/src/pages/Workout.jsx:104-131` (mount effect)
- Modify: `frontend/src/pages/Workout.test.jsx` (existing `mockSession` helper + three inline `api.get.mockImplementation` blocks all need a `/personal-bests` branch or they'll throw `unmocked GET`; add new tests)

**Interfaces:**
- Consumes: `GET /api/personal-bests` (Task 2).
- Produces: `Workout.jsx`'s `prs` state / `prsAtStart.current` now hold `max(session-derived max, historical PB max)` per `exercise_id`, and — this is the one behavioral change beyond the spec's literal wording — the **first auto-expanded exercise's initial weight prefill** now also uses that merged map. (Today it doesn't: `prefillFor(firstId, s.sets || [], {}, data?.sets)` at the old `backend/main.py:115`-equivalent line passes a literal `{}`, so even the existing in-app `/api/progress` max is silently ignored for the very first card shown at mount. Since the primary scenario for this feature — opening a fresh workout for an exercise you've never logged in-app but have a historical PB for — *is* that first card, this gap has to close for the feature to visibly work. Every other prefill call site, `frontend/src/pages/Workout.jsx:323` and `:205`, already correctly passes the live `prs` state and needs no change.)

- [ ] **Step 1: Add `/personal-bests` handling to every existing mock, so nothing breaks before the real change lands**

In `frontend/src/pages/Workout.test.jsx`:

In `mockSession()` (`frontend/src/pages/Workout.test.jsx:14-28`), add a line:

```jsx
    if (path === '/progress') return []
    if (path === '/personal-bests') return []
```

In the three inline `api.get.mockImplementation` blocks at `frontend/src/pages/Workout.test.jsx:88`, `:115`, `:140`, add the same `if (path === '/personal-bests') return []` line right after each block's `if (path === '/progress') ...` line.

Run: `cd frontend && npm test -- Workout.test.jsx`
Expected: still PASS (these are scaffolding-only additions; Workout.jsx doesn't call `/personal-bests` yet, so this step alone doesn't change behavior — it just makes the mocks forward-compatible with the next step).

- [ ] **Step 2: Write the failing tests for the new behavior**

Add to `frontend/src/pages/Workout.test.jsx`, inside `describe('Workout page', ...)`:

```jsx
  it('prefills the very first exercise from a historical PB when there is no in-app history', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') {
        return [{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   weight_kg: 120, reps: 1, achieved_year: 2021, achieved_note: null }]
      }
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    renderWorkout()
    await screen.findByText(ex1.name)
    await waitFor(() => expect(screen.getByDisplayValue('120')).toBeInTheDocument())
  })

  it('a historical PB sets the bar for the live PR toast', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/sessions/1') {
        return { id: 1, workout_day: 'upper_a', date: '2026-07-09', completed: 0,
                 created_at: '2026-07-09 10:00:00', ended_at: null, sets: [] }
      }
      if (path === '/notes') return {}
      if (path === '/progress') return []
      if (path === '/personal-bests') {
        return [{ id: 1, exercise_id: ex1.id, exercise_name: ex1.name,
                   weight_kg: 100, reps: 1, achieved_year: 2021, achieved_note: null }]
      }
      if (path.startsWith('/exercises/')) return null
      if (path === '/sessions/1/prs') return []
      throw new Error(`unmocked GET ${path}`)
    })
    api.post.mockImplementation(async (path, body) => ({ id: 99, ...body }))
    renderWorkout()
    await screen.findByText(ex1.name)
    await waitFor(() => expect(screen.getByDisplayValue('100')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'increase' })[0])  // weight stepper is first
    await waitFor(() => expect(screen.getByDisplayValue('102.5')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /log set/i }))
    await waitFor(() => expect(screen.getByText(/🏆 PR! 102.5kg/)).toBeInTheDocument())
  })
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `cd frontend && npm test -- Workout.test.jsx`
Expected: FAIL on both new tests — the weight stays at the default (`20`) instead of `120`/`100`, since `Workout.jsx` never fetches `/personal-bests` yet.

- [ ] **Step 4: Restructure the mount effect**

In `frontend/src/pages/Workout.jsx`, replace the mount `useEffect` (`frontend/src/pages/Workout.jsx:104-131`):

```jsx
  useEffect(() => {
    const prsPromise = Promise.all([
      api.get('/progress').catch(() => []),
      api.get('/personal-bests').catch(() => []),
    ]).then(([exercises, pbs]) => {
      const prMap = {}
      for (const ex of exercises) {
        if (ex.max_weight != null) prMap[ex.exercise_id] = ex.max_weight
      }
      for (const pb of pbs) {
        const cur = prMap[pb.exercise_id]
        if (cur == null || pb.weight_kg > cur) prMap[pb.exercise_id] = pb.weight_kg
      }
      return prMap
    })

    api.get(`/sessions/${sessionId}`).then(async s => {
      setSession(s); setSets(s.sets || [])
      const prMap = await prsPromise
      prsAtStart.current = prMap
      setPrs(prMap)
      // An unrecognised workout_day must not throw here: the effect's .catch
      // would swallow it and bounce to Home, making the "Unknown workout day."
      // fallback below unreachable. No exercises means no first ID — the
      // fallback then renders as intended.
      const firstId = nextIncompleteExerciseId(PLAN[s.workout_day]?.exercises || [], s.sets || [])
      if (firstId) {
        setExpanded(firstId)
        const data = await ensureLastPerf(firstId)
        const pf = prefillFor(firstId, s.sets || [], prMap, data?.sets)
        setWeight(pf.weight); setReps(pf.reps)
      }
    }).catch(() => nav('/'))
    // Load notes
    api.get('/notes').then(setNotes).catch(() => {})
  }, [sessionId])
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `cd frontend && npm test -- Workout.test.jsx`
Expected: PASS, all tests in the file including the two new ones.

- [ ] **Step 6: Run the full frontend suite to check for regressions**

Run: `cd frontend && npm test`
Expected: PASS, all green (baseline was 142 tests per the handoff; expect it to grow by the tests added across Tasks 5, 6, and this one).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Workout.jsx frontend/src/pages/Workout.test.jsx
git commit -m "feat(personal-bests): historical PBs count toward the live PR toast and prefill"
```

---

## Deploy

This is a schema migration (v2 → v3). Per `AGENTS.md`:
1. Take a pre-deploy `/api/export` snapshot before shipping.
2. Deploy (build on the Mac — never on the Pi; see `AGENTS.md` §Local development for exact non-`PATH` invocations).
3. Run a restore drill afterward (import that snapshot back) to confirm the migration and the import path both work against real data — this is the same drill discipline as the last one (2026-07-09).
