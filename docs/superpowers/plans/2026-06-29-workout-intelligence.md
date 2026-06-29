# Workout Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** History-aware logging — show last workout's sets, suggest progressive overload, prefill from last workout, detect 4 kinds of PRs, per-exercise notes, plus rest-timer pause + remembered duration and loading skeletons.

**Architecture:** One new SQLite table (`exercise_notes`) + four additive FastAPI endpoints (last-performance, session-PRs, notes get/put). PR + overload + prefill logic are pure functions, unit-tested (pytest/Vitest). Frontend consumes them; UI verified by build + manual.

**Tech Stack:** FastAPI + SQLite (pytest), React 18 + Vite (Vitest). Plain JavaScript — NO TypeScript. No new runtime dependencies.

## Global Constraints
- Plain JS only (no TS migration). No new runtime npm/pip dependencies (test deps already present).
- Preserve the design language; keep components small; reuse existing state patterns; keep the UI uncluttered; every change reduces taps or improves flow.
- Backend changes are additive only: a new `exercise_notes` table + new endpoints. NEVER alter or drop existing `sessions`/`sets` data. Idempotent table creation in `init()`.
- "Completed workout" = `sessions.completed = 1`; the active session is excluded from "previous" lookups.
- Estimated 1RM = Epley: `weight * (1 + reps/30)`, rounded to 0.5.
- Progressive overload increment = 2.5 kg.
- Remembered rest duration is a UI preference in `localStorage` (not workout data). Default 90s.
- Keep the existing live in-set "🏆 PR!" toast; the new PR detection augments the finish summary.
- Backend runs on `python:3.11-slim` in Docker; local dev venv is Python 3.14 (tests already run there).

---

### Task 1: Backend — `exercise_notes` table + notes endpoints

**Files:** Modify `backend/main.py`; Test `backend/test_notes.py`

**Interfaces — Produces:**
- `GET /api/notes` → `{ "<exercise_id>": "<note>", ... }`
- `PUT /api/exercises/{exercise_id}/note` body `{"note": "..."}` → `{"exercise_id","note"}`; empty/whitespace note deletes the row and returns `{"exercise_id","note":""}`.

- [ ] **Step 1: Failing test** — create `backend/test_notes.py`:
```python
import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main; importlib.reload(main)
    return TestClient(main.app)

def test_notes_upsert_get_delete(client):
    assert client.get("/api/notes").json() == {}
    client.put("/api/exercises/bench_press/note", json={"note": "Pause at chest"})
    assert client.get("/api/notes").json() == {"bench_press": "Pause at chest"}
    # update
    client.put("/api/exercises/bench_press/note", json={"note": "Elbows tucked"})
    assert client.get("/api/notes").json()["bench_press"] == "Elbows tucked"
    # empty deletes
    client.put("/api/exercises/bench_press/note", json={"note": "   "})
    assert client.get("/api/notes").json() == {}
```

- [ ] **Step 2: Run, verify fail** — `cd backend && . .venv/bin/activate && pytest test_notes.py -v` → FAIL (404 / route missing).

- [ ] **Step 3: Implement** — in `backend/main.py`:
In `init()` add to the `executescript`:
```sql
        CREATE TABLE IF NOT EXISTS exercise_notes (
            exercise_id TEXT PRIMARY KEY,
            note TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );
```
Add a model + routes:
```python
class NoteIn(BaseModel):
    note: str

@app.get("/api/notes")
def get_notes():
    conn = db()
    rows = conn.execute("SELECT exercise_id, note FROM exercise_notes").fetchall()
    conn.close(); return {r["exercise_id"]: r["note"] for r in rows}

@app.put("/api/exercises/{exercise_id}/note")
def put_note(exercise_id: str, n: NoteIn):
    note = n.note.strip()
    conn = db()
    if note:
        conn.execute(
            "INSERT INTO exercise_notes (exercise_id, note, updated_at) VALUES (?,?,datetime('now')) "
            "ON CONFLICT(exercise_id) DO UPDATE SET note=excluded.note, updated_at=datetime('now')",
            (exercise_id, note))
    else:
        conn.execute("DELETE FROM exercise_notes WHERE exercise_id = ?", (exercise_id,))
    conn.commit(); conn.close(); return {"exercise_id": exercise_id, "note": note}
```

- [ ] **Step 4: Run, verify pass** — `pytest test_notes.py -v` → PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/main.py backend/test_notes.py
git commit -m "feat(backend): exercise notes table + get/put endpoints"
```

---

### Task 2: Backend — last-performance + session-PRs endpoints (PR logic TDD)

**Files:** Modify `backend/main.py`; Test `backend/test_history.py`

**Interfaces — Produces:**
- `GET /api/exercises/{exercise_id}/last?exclude_session={id}` → `{"session_id","date","sets":[{"set_number","weight_kg","reps"}]}` or `null`.
- `GET /api/sessions/{id}/prs` → `[{"type","exercise_name","value","unit"}]` (types: `weight`, `reps`, `1rm`, `volume`).
- Pure helper `epley(weight, reps)` → `round(weight*(1+reps/30)*2)/2`.

- [ ] **Step 1: Failing test** — create `backend/test_history.py`:
```python
import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main; importlib.reload(main)
    return TestClient(main.app)

def _session(client, day, sets, complete=True):
    sid = client.post("/api/sessions", json={"workout_day": day}).json()["id"]
    for i, (ex, w, r) in enumerate(sets, 1):
        client.post(f"/api/sessions/{sid}/sets",
                    json={"exercise_id": ex, "exercise_name": ex, "set_number": i, "reps": r, "weight_kg": w})
    if complete:
        client.patch(f"/api/sessions/{sid}", json={"completed": True})
    return sid

def test_last_returns_prior_completed_sets_excluding_active(client):
    _session(client, "upper_a", [("bench_press", 80, 8), ("bench_press", 80, 8)])
    active = _session(client, "upper_a", [("bench_press", 82, 6)], complete=False)
    r = client.get(f"/api/exercises/bench_press/last?exclude_session={active}").json()
    assert r["sets"] == [
        {"set_number": 1, "weight_kg": 80, "reps": 8},
        {"set_number": 2, "weight_kg": 80, "reps": 8}]
    assert client.get("/api/exercises/never/last").json() is None

def test_session_prs_detects_types(client):
    _session(client, "upper_a", [("bench_press", 80, 8)])           # prior best
    sid = _session(client, "upper_a", [("bench_press", 85, 8)])     # new weight + 1rm
    prs = client.get(f"/api/sessions/{sid}/prs").json()
    types = {p["type"]: p for p in prs}
    assert types["weight"]["value"] == 85 and types["weight"]["exercise_name"] == "bench_press"
    assert "1rm" in types
    assert "volume" in types  # 85*8=680 > 80*8=640
```

- [ ] **Step 2: Run, verify fail** — `pytest test_history.py -v` → FAIL.

- [ ] **Step 3: Implement** — in `backend/main.py` add:
```python
def epley(weight, reps):
    return round(weight * (1 + reps / 30) * 2) / 2

@app.get("/api/exercises/{exercise_id}/last")
def last_performance(exercise_id: str, exclude_session: int | None = None):
    conn = db()
    row = conn.execute(
        "SELECT s.id, s.date FROM sessions s "
        "JOIN sets st ON st.session_id = s.id "
        "WHERE s.completed = 1 AND st.exercise_id = ? AND s.id != ? "
        "ORDER BY s.created_at DESC LIMIT 1",
        (exercise_id, exclude_session if exclude_session is not None else -1)).fetchone()
    if not row:
        conn.close(); return None
    sets = conn.execute(
        "SELECT set_number, weight_kg, reps FROM sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_number",
        (row["id"], exercise_id)).fetchall()
    conn.close()
    return {"session_id": row["id"], "date": row["date"], "sets": [dict(s) for s in sets]}

@app.get("/api/sessions/{sid}/prs")
def session_prs(sid: int):
    conn = db()
    cur_sets = conn.execute("SELECT exercise_id, exercise_name, weight_kg, reps FROM sets WHERE session_id = ?", (sid,)).fetchall()
    prior = conn.execute(
        "SELECT st.exercise_id, st.weight_kg, st.reps FROM sets st "
        "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 AND s.id != ?", (sid,)).fetchall()
    # session volumes for the volume PR
    vol_rows = conn.execute(
        "SELECT st.session_id, SUM(st.weight_kg*st.reps) v FROM sets st "
        "JOIN sessions s ON s.id = st.session_id WHERE s.completed = 1 GROUP BY st.session_id").fetchall()
    conn.close()

    prs = []
    by_ex = {}
    for r in cur_sets:
        by_ex.setdefault(r["exercise_id"], {"name": r["exercise_name"], "sets": []})["sets"].append(r)
    for ex_id, info in by_ex.items():
        psets = [p for p in prior if p["exercise_id"] == ex_id]
        cur_w = max(s["weight_kg"] for s in info["sets"])
        if not psets or cur_w > max(p["weight_kg"] for p in psets):
            prs.append({"type": "weight", "exercise_name": info["name"], "value": cur_w, "unit": "kg"})
        # reps at the session's top weight for this exercise
        cur_reps = max(s["reps"] for s in info["sets"] if s["weight_kg"] == cur_w)
        prior_reps_at_w = [p["reps"] for p in psets if p["weight_kg"] == cur_w]
        if not prior_reps_at_w or cur_reps > max(prior_reps_at_w):
            prs.append({"type": "reps", "exercise_name": info["name"], "value": cur_reps, "unit": f"@{cur_w}kg"})
        cur_1rm = max(epley(s["weight_kg"], s["reps"]) for s in info["sets"])
        if not psets or cur_1rm > max(epley(p["weight_kg"], p["reps"]) for p in psets):
            prs.append({"type": "1rm", "exercise_name": info["name"], "value": cur_1rm, "unit": "kg"})

    cur_vol = next((row["v"] for row in vol_rows if row["session_id"] == sid), 0) or 0
    prior_vols = [row["v"] for row in vol_rows if row["session_id"] != sid]
    if cur_vol and (not prior_vols or cur_vol > max(prior_vols)):
        prs.append({"type": "volume", "exercise_name": None, "value": cur_vol, "unit": "kg"})
    return prs
```
(`int | None` is valid on Python 3.11/3.14.)

- [ ] **Step 4: Run, verify pass** — `pytest test_history.py -v` → PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/main.py backend/test_history.py
git commit -m "feat(backend): last-performance + session-PRs endpoints (weight/reps/1rm/volume)"
```

---

### Task 3: Frontend — overload helper + extended prefill (TDD)

**Files:** Create `frontend/src/lib/overload.js`; Test `frontend/src/lib/overload.test.js`; Modify `frontend/src/lib/workoutFlow.js` + `frontend/src/lib/workoutFlow.test.js`

**Interfaces — Produces:**
- `overloadSuggestion(lastSets, repsHigh, increment = 2.5)` → `{weight, hitTarget}` or `null` (no history). `lastSets` = `[{weight_kg, reps}]`. `topWeight` = max `weight_kg`. If non-empty AND every set `reps >= repsHigh` → `{weight: topWeight + increment, hitTarget: true}`; else `{weight: topWeight, hitTarget: false}`.
- `prefillFor(exerciseId, sets, progressMaxByExercise = {}, lastSets = null)` — extended: when no this-session sets, if `lastSets` is a non-empty array use its **first** set `{weight: lastSets[0].weight_kg, reps: lastSets[0].reps}`; else progress-max path; else 20×8.

- [ ] **Step 1: Failing tests** — create `frontend/src/lib/overload.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { overloadSuggestion } from './overload'

describe('overloadSuggestion', () => {
  it('suggests +increment when all sets hit the top rep target', () => {
    expect(overloadSuggestion([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 8 }], 8))
      .toEqual({ weight: 82.5, hitTarget: true })
  })
  it('repeats weight when not all sets hit target', () => {
    expect(overloadSuggestion([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 6 }], 8))
      .toEqual({ weight: 80, hitTarget: false })
  })
  it('returns null with no history', () => {
    expect(overloadSuggestion([], 8)).toBeNull()
    expect(overloadSuggestion(null, 8)).toBeNull()
  })
})
```
Add to `frontend/src/lib/workoutFlow.test.js` a new describe:
```js
import { prefillFor } from './workoutFlow'
describe('prefillFor with lastSets', () => {
  it('uses previous workout first set when no this-session sets', () => {
    const last = [{ weight_kg: 75, reps: 10 }, { weight_kg: 80, reps: 8 }]
    expect(prefillFor('a', [], {}, last)).toEqual({ weight: 75, reps: 10 })
  })
  it('prefers this-session last set over lastSets', () => {
    const sets = [{ exercise_id: 'a', weight_kg: 60, reps: 8 }]
    expect(prefillFor('a', sets, {}, [{ weight_kg: 75, reps: 10 }])).toEqual({ weight: 60, reps: 8 })
  })
})
```

- [ ] **Step 2: Run, verify fail** — `cd frontend && npm test` → FAIL.

- [ ] **Step 3: Implement** — create `frontend/src/lib/overload.js`:
```js
export function overloadSuggestion(lastSets, repsHigh, increment = 2.5) {
  if (!Array.isArray(lastSets) || lastSets.length === 0) return null
  const topWeight = Math.max(...lastSets.map(s => s.weight_kg))
  const allHit = lastSets.every(s => s.reps >= repsHigh)
  return allHit ? { weight: topWeight + increment, hitTarget: true }
                : { weight: topWeight, hitTarget: false }
}
```
Edit `frontend/src/lib/workoutFlow.js` — extend `prefillFor`:
```js
export function prefillFor(exerciseId, sets, progressMaxByExercise = {}, lastSets = null) {
  const exSets = sets.filter(s => s.exercise_id === exerciseId)
  if (exSets.length) {
    const last = exSets[exSets.length - 1]
    return { weight: last.weight_kg, reps: last.reps }
  }
  if (Array.isArray(lastSets) && lastSets.length) {
    return { weight: lastSets[0].weight_kg, reps: lastSets[0].reps }
  }
  const pm = progressMaxByExercise[exerciseId]
  if (pm != null) return { weight: pm, reps: 8 }
  return { weight: 20, reps: 8 }
}
```

- [ ] **Step 4: Run, verify pass** — `npm test` → PASS (existing + new).
- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/overload.js frontend/src/lib/overload.test.js frontend/src/lib/workoutFlow.js frontend/src/lib/workoutFlow.test.js
git commit -m "feat(frontend): overload suggestion + prefill from previous workout"
```

---

### Task 4: Frontend — previous performance + overload hint in Workout, prefill wiring

**Files:** Modify `frontend/src/pages/Workout.jsx`; `frontend/src/api.js` (no change needed — uses existing `api.get`)

**Interfaces — Consumes:** `GET /api/exercises/{id}/last`; `overloadSuggestion`, extended `prefillFor`.

- [ ] **Step 1: Fetch + cache last performance per exercise**

Add state and a fetch-on-expand. Near other state:
```jsx
  const [lastPerf, setLastPerf] = useState({}) // exercise_id -> {sets,...} | null
```
Add a helper that fetches once per exercise (call it when an exercise expands and on load for the first incomplete):
```jsx
  async function ensureLastPerf(exId) {
    if (exId in lastPerf) return lastPerf[exId]
    try {
      const data = await api.get(`/exercises/${exId}/last?exclude_session=${sessionId}`)
      setLastPerf(prev => ({ ...prev, [exId]: data }))
      return data
    } catch { setLastPerf(prev => ({ ...prev, [exId]: null })); return null }
  }
```

- [ ] **Step 2: Use last-perf in prefill** — when expanding/auto-advancing, prefer the previous workout's first set. Update the expand handler and auto-advance to call `ensureLastPerf(ex.id)` then `prefillFor(ex.id, sets, prs, (lastPerf[ex.id]||await ensureLastPerf(ex.id))?.sets)`. Keep it simple: after `const data = await ensureLastPerf(ex.id)`, `const pf = prefillFor(ex.id, sets, prs, data?.sets); setWeight(pf.weight); setReps(pf.reps)`.

- [ ] **Step 3: Render the subtle "Last workout" + overload hint** inside the expanded exercise block, under the title area (above the set logger). Use muted styling (`#9ca3af`, small):
```jsx
                {lastPerf[ex.id] && lastPerf[ex.id].sets?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ color: '#9ca3af', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Last workout</p>
                    {lastPerf[ex.id].sets.map(s => (
                      <p key={s.set_number} className="font-mono" style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{s.weight_kg}kg × {s.reps}</p>
                    ))}
                    {(() => {
                      const sug = overloadSuggestion(lastPerf[ex.id].sets, ex.repsHigh)
                      return sug ? (
                        <p style={{ color: '#6ee7b7', fontSize: '0.75rem', marginTop: 6 }}>
                          Suggested <strong>{sug.weight}kg</strong> · Target {ex.repsLow}–{ex.repsHigh}
                        </p>
                      ) : null
                    })()}
                  </div>
                )}
```
Import `overloadSuggestion` from `../lib/overload`. Reserve space / avoid layout shift by rendering the block container even while loading (a one-line skeleton — see Task 6 for the Skeleton component; for now a muted "…" is acceptable and replaced in Task 6).

- [ ] **Step 4: Verify** — `npm test` (pass) + `npm run build`. Manual smoke not run; note it.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Workout.jsx
git commit -m "feat(frontend): previous performance + overload hint + prev-workout prefill"
```

---

### Task 5: Frontend — comprehensive PRs in finish summary + exercise notes

**Files:** Modify `frontend/src/pages/Workout.jsx`

**Interfaces — Consumes:** `GET /api/sessions/{id}/prs`, `GET /api/notes`, `PUT /api/exercises/{id}/note`.

- [ ] **Step 1: Use server PRs in the summary** — in `finishWorkout`, after the PATCH, fetch PRs and include them:
```jsx
      let serverPrs = []
      try { serverPrs = await api.get(`/sessions/${sessionId}/prs`) } catch {}
      const stats = summarize(sets, prsAtStart.current)
      setSummary({ ...stats, durSec, serverPrs })
```
In the summary card, replace the PR line with the server PRs (subtle, one line each):
```jsx
        {summary.serverPrs?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {summary.serverPrs.map((p, i) => (
              <p key={i} style={{ color: '#fbbf24', fontSize: '0.8rem' }}>
                🎉 New PR — {prLabel(p)}
              </p>
            ))}
          </div>
        )}
```
Add a small `prLabel` helper above the component:
```jsx
function prLabel(p) {
  const who = p.exercise_name ? `${p.exercise_name} ` : ''
  if (p.type === 'weight')  return `Highest ${who}weight: ${p.value}kg`
  if (p.type === 'reps')    return `Most ${who}reps ${p.unit}: ${p.value}`
  if (p.type === '1rm')     return `Highest ${who}est. 1RM: ${p.value}kg`
  if (p.type === 'volume')  return `Highest session volume: ${p.value.toLocaleString()}kg`
  return 'New record'
}
```
(Keep the existing live in-set "🏆 PR!" toast in `logSet` unchanged.)

- [ ] **Step 2: Notes — fetch + edit** — add state and fetch on load:
```jsx
  const [notes, setNotes] = useState({})
  const [editingNote, setEditingNote] = useState(null)
```
In the mount effect add: `api.get('/notes').then(setNotes).catch(() => {})`.
Add a save handler:
```jsx
  async function saveNote(exId, text) {
    setNotes(prev => ({ ...prev, [exId]: text }))
    setEditingNote(null)
    try { await api.put(`/exercises/${exId}/note`, { note: text }) }
    catch { showToast('Failed to save note', 'error') }
  }
```
Render under each exercise title (in the expanded block, near the last-workout block): when `editingNote === ex.id` show a small `<textarea>` (autoFocus, onBlur → saveNote); otherwise show the note text (muted, small) or a faint "＋ Add note" button that sets `editingNote`:
```jsx
                {editingNote === ex.id ? (
                  <textarea defaultValue={notes[ex.id] || ''} autoFocus
                    onBlur={e => saveNote(ex.id, e.target.value.trim())}
                    style={{ width: '100%', background: '#1e1e32', border: 'none', borderRadius: 8, color: '#e2e8f0', fontSize: '0.8rem', padding: 8, resize: 'vertical' }} />
                ) : notes[ex.id] ? (
                  <p onClick={() => setEditingNote(ex.id)} style={{ color: '#9ca3af', fontSize: '0.78rem', fontStyle: 'italic', marginBottom: 10, cursor: 'text' }}>📝 {notes[ex.id]}</p>
                ) : (
                  <button onClick={() => setEditingNote(ex.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.72rem', padding: 0, marginBottom: 10, cursor: 'pointer' }}>＋ Add note</button>
                )}
```

- [ ] **Step 3: Verify** — `npm test` + `npm run build`. Note manual smoke not run.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Workout.jsx
git commit -m "feat(frontend): comprehensive PRs in summary + per-exercise notes"
```

---

### Task 6: Rest timer pause + remembered duration; loading skeletons; memoization

**Files:** Create `frontend/src/lib/useRestPreference.js`, `frontend/src/components/Skeleton.jsx`; Modify `frontend/src/components/TimerBar.jsx`, `frontend/src/pages/Workout.jsx`, `frontend/src/pages/History.jsx`, `frontend/src/pages/Progress.jsx`

- [ ] **Step 1: Remembered duration hook** — create `frontend/src/lib/useRestPreference.js`:
```js
import { useState, useCallback } from 'react'
const KEY = 'restPrefSec'
export function useRestPreference(fallback = 90) {
  const [restPref, setRestPrefState] = useState(() => {
    const v = parseInt(localStorage.getItem(KEY) || '', 10)
    return Number.isFinite(v) && v > 0 ? v : fallback
  })
  const setRestPref = useCallback((sec) => {
    const v = Math.max(0, Math.round(sec))
    setRestPrefState(v); localStorage.setItem(KEY, String(v))
  }, [])
  return [restPref, setRestPref]
}
```

- [ ] **Step 2: Use the preference in Workout.jsx** — replace `const [restTargetSec, setRestTargetSec] = useState(90)` with `const [restTargetSec, setRestTargetSec] = useRestPreference(90)` (import it). In `logSet`, `setRestTargetSec(restTargetSec)` is implicit (the start uses current pref) — change the rest-start to `setRestStartMs(Date.now())` only (drop the hard-coded `setRestTargetSec(90)`; the remembered pref is the target). The TimerBar `onAddRest` already calls `setRestTargetSec(t => ...)`, which now persists via the hook.

- [ ] **Step 3: Pause/resume in TimerBar.jsx** — add a paused state driven by the parent. Add props `paused` and `onTogglePause`, and an accumulated approach: when paused, freeze the displayed remaining by anchoring. Simplest correct approach handled in the parent: Workout holds `restStartMs`; pausing stores `pausedRemaining` and clears `restStartMs`; resuming sets `restStartMs = Date.now() - (restTargetSec - pausedRemaining)*1000`. Implement in Workout.jsx:
```jsx
  const [pausedRem, setPausedRem] = useState(null)
  function togglePause() {
    if (pausedRem == null) {
      const rem = remainingSeconds(restStartMs, restTargetSec, Date.now())
      setPausedRem(rem); setRestStartMs(null)
    } else {
      setRestStartMs(Date.now() - (restTargetSec - pausedRem) * 1000)
      setPausedRem(null)
    }
  }
```
Import `remainingSeconds` from `../lib/timer`. Pass to TimerBar: `paused={pausedRem != null}`, `pausedRem={pausedRem}`, `onTogglePause={togglePause}`. In TimerBar, when `paused`, show `formatClock(pausedRem)` as the countdown (frozen) and render a Resume button; otherwise show the live value and a Pause button. (Add `aria-label`.)

- [ ] **Step 4: Skeleton component + use on loads** — create `frontend/src/components/Skeleton.jsx`:
```jsx
export default function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, borderRadius: 8, ...style }} />
}
```
Add to `index.css`:
```css
.skeleton { background: linear-gradient(90deg,#1a1a2e 25%,#23233a 37%,#1a1a2e 63%); background-size: 400% 100%; animation: shimmer 1.4s ease infinite; }
@keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }
@media (prefers-reduced-motion: reduce){ .skeleton{ animation: none } }
```
Replace the bare "Loading…" returns in `History.jsx` and `Progress.jsx` (and the Workout initial `if (!session)`) with a few stacked `<Skeleton>` cards. Keep it minimal — 2–3 skeleton blocks.

- [ ] **Step 5: Memoize expensive calcs** — in `History.jsx`, the per-session grouped-sets computation runs in render for every session; wrap the expanded detail grouping in `useMemo` keyed by the detail object. In `Workout.jsx`, memoize nothing heavy unless present (the summarize call already runs once on finish). Keep changes minimal and behavior-identical.

- [ ] **Step 6: Verify** — `npm test` + `npm run build`. Confirm no `prefers-reduced-motion` regressions. Manual smoke not run.
- [ ] **Step 7: Commit**
```bash
git add frontend/src/lib/useRestPreference.js frontend/src/components/Skeleton.jsx frontend/src/components/TimerBar.jsx frontend/src/pages/Workout.jsx frontend/src/pages/History.jsx frontend/src/pages/Progress.jsx frontend/src/index.css
git commit -m "feat(frontend): rest pause + remembered duration, loading skeletons, memoization"
```

---

### Task 7: Build, deploy to Pi, verify (covers BOTH this batch and the earlier timer/UX work)

- [ ] **Step 1: Merge the earlier UX branch into this one first** if not already shared — confirm `feat/ux-improvements` work is present (this branch builds on it). (If branches diverged, rebase/merge before building.)
- [ ] **Step 2: Build** — `docker buildx build --platform linux/arm64 -t kapekost/workout-tracker:latest --load .`
- [ ] **Step 3: Smoke locally** — run on :8099 with temp volume; verify `GET /` 200, `GET /api/notes` 200 (`{}`), create+complete a session and `GET /api/sessions/{id}/prs` 200; remove container.
- [ ] **Step 4: Transfer** — `docker save ... | gzip | ssh -i ~/.ssh/id_raspi kapekost@192.168.1.170 'gunzip | docker load'`.
- [ ] **Step 5: Restart on Pi** — `ssh ... 'cd ~/workout-tracker && docker compose up -d'`.
- [ ] **Step 6: Verify** — app 200; `homeassistant` still healthy; the new `exercise_notes` table auto-created (PUT a note, GET it, then clear it). Confirm a real session shows previous-performance + summary PRs.
- [ ] **Step 7: Update AGENTS.md status + commit.**

---

## Notes for the implementer
- Backend `int | None` query param type works on the Pi's Python 3.11.
- Don't change existing `sessions`/`sets` schema; only add `exercise_notes`.
- Keep the live in-set "🏆 PR!" toast; server PRs are for the finish summary.
- `prefillFor`'s 4th arg is optional — existing callers (Task 6 of prior plan) keep working; new callers pass `lastSets`.
- Remembered rest duration is localStorage (UI pref), everything else is backend.
