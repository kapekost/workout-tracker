# Workout Timer, Session Tracking & Inline Exercise Demos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rest/session timer and post-workout summary to the active workout flow, capture session duration, and replace the YouTube-search link with an inline ExerciseDB animation per exercise.

**Architecture:** Pure logic (timer math, summary stats, demo-URL lookup) lives in small `frontend/src/lib/*.js` modules unit-tested with Vitest; React components consume them. The backend gains one additive SQLite column (`ended_at`) set on completion, tested with pytest + FastAPI `TestClient`. Demo GIF URLs are resolved once at build time by a Node script into a committed `exerciseDemos.json`; the client only loads images and falls back to the existing YouTube link when a demo is missing.

**Tech Stack:** React 18 + Vite 5, FastAPI 0.111 + SQLite, Vitest + @testing-library (new dev deps, frontend only), pytest + httpx (new dev deps, backend only), ExerciseDB via RapidAPI (build-time only).

## Global Constraints

- **NEVER build the image on the Pi.** Builds happen only on the Mac. (test/dev tooling is dev-only and must not enlarge the runtime image or require building on the Pi)
- **No new runtime dependencies** for the app itself. Test deps go in `devDependencies` / a separate `requirements-dev.txt`, never in the shipped image.
- **`RAPIDAPI_KEY` is read from the Mac environment only.** It is NEVER committed and NEVER shipped to the client. Only the resolved `exerciseDemos.json` (plain GIF URLs) is committed.
- **Apple HealthKit / Apple Watch / Shortcut export are out of scope.**
- Rest timer default = **90 seconds**; adjust controls = **±30s** and **Skip**.
- Done-alert is **audio beep + visual flash, foreground only** (no Vibration API on iOS).
- Timestamps `created_at` and `ended_at` are both SQLite `datetime('now')` (UTC); durations are computed as their difference.
- Deploy model unchanged: Mac build → `docker save | ssh | docker load` → `docker compose up -d` on the Pi.

---

### Task 1: Backend — `ended_at` column, set on completion, returned in responses

**Files:**
- Modify: `backend/main.py` (init/migration, `patch_session`, ensure `ended_at` flows through `SELECT *`)
- Create: `backend/requirements-dev.txt`
- Test: `backend/test_main.py`

**Interfaces:**
- Produces: `sessions` rows now include `ended_at` (string `"YYYY-MM-DD HH:MM:SS"` or `null`). `PATCH /api/sessions/{id}` with `{"completed": true}` sets `ended_at` to `datetime('now')` if not already set; setting `completed:false` leaves/clears nothing extra. `GET /api/sessions` and `GET /api/sessions/{id}` return `ended_at`.

- [ ] **Step 1: Add backend dev requirements**

Create `backend/requirements-dev.txt`:
```
-r requirements.txt
pytest==8.2.0
httpx==0.27.0
```

Install locally:
```bash
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
```
`.venv/` is already covered by typical ignores; confirm `backend/.venv/` is gitignored (add it to `.gitignore` if missing).

- [ ] **Step 2: Write the failing test**

Create `backend/test_main.py`:
```python
import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def client(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)  # re-run init() against the temp DB
    return TestClient(main.app)

def test_completing_session_sets_ended_at(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]

    created = client.get(f"/api/sessions/{sid}").json()
    assert created["ended_at"] is None

    patched = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()
    assert patched["completed"] == 1
    assert patched["ended_at"] is not None

    listed = client.get("/api/sessions").json()
    assert any(s["id"] == sid and s["ended_at"] is not None for s in listed)

def test_ended_at_is_stable_on_repeat_complete(client):
    sid = client.post("/api/sessions", json={"workout_day": "upper_a"}).json()["id"]
    first = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()["ended_at"]
    second = client.patch(f"/api/sessions/{sid}", json={"completed": True}).json()["ended_at"]
    assert first == second  # not overwritten on re-complete
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && . .venv/bin/activate && pytest test_main.py -v`
Expected: FAIL — `KeyError: 'ended_at'` (column not present in responses).

- [ ] **Step 4: Add the column migration**

In `backend/main.py`, inside `init()` after the `executescript(...)` block and before `conn.commit()`, add an idempotent migration:
```python
    cols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
    if "ended_at" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN ended_at TEXT")
```

- [ ] **Step 5: Set `ended_at` on completion**

In `patch_session`, replace the completed branch:
```python
    if p.completed is not None:
        if p.completed:
            conn.execute(
                "UPDATE sessions SET completed = 1, "
                "ended_at = COALESCE(ended_at, datetime('now')) WHERE id = ?",
                (sid,))
        else:
            conn.execute("UPDATE sessions SET completed = 0 WHERE id = ?", (sid,))
```
(`GET` routes already use `SELECT *`, so `ended_at` flows through automatically.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && . .venv/bin/activate && pytest test_main.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/test_main.py backend/requirements-dev.txt .gitignore
git commit -m "feat(backend): add ended_at to sessions, set on completion"
```

---

### Task 2: Frontend — timer pure-logic module + Vitest setup

**Files:**
- Modify: `frontend/package.json` (devDeps + `test` script)
- Create: `frontend/src/lib/timer.js`
- Test: `frontend/src/lib/timer.test.js`

**Interfaces:**
- Produces:
  - `remainingSeconds(startMs: number, targetSeconds: number, nowMs: number): number` — whole seconds left, clamped to `>= 0`.
  - `elapsedSeconds(startMs: number, nowMs: number): number` — whole seconds since start, `>= 0`.
  - `formatClock(totalSeconds: number): string` — `"M:SS"` under an hour, `"H:MM:SS"` at/over an hour.

- [ ] **Step 1: Add Vitest dev deps and test script**

```bash
cd frontend && npm install -D vitest@^1.6.0 jsdom@^24.0.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.4.0
```
In `frontend/package.json` `"scripts"`, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
Add to `frontend/vite.config.js` (inside the exported config) a test block:
```js
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js' },
```
Create `frontend/src/test-setup.js`:
```js
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/timer.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { remainingSeconds, elapsedSeconds, formatClock } from './timer'

describe('remainingSeconds', () => {
  it('counts down from the target', () => {
    expect(remainingSeconds(1000, 90, 1000)).toBe(90)
    expect(remainingSeconds(1000, 90, 31000)).toBe(60) // 30s elapsed
  })
  it('clamps to zero (handles throttled gaps)', () => {
    expect(remainingSeconds(1000, 90, 999999)).toBe(0)
  })
})

describe('elapsedSeconds', () => {
  it('counts up and never goes negative', () => {
    expect(elapsedSeconds(1000, 61000)).toBe(60)
    expect(elapsedSeconds(5000, 1000)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats sub-hour as M:SS', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(75)).toBe('1:15')
  })
  it('formats hour-plus as H:MM:SS', () => {
    expect(formatClock(3661)).toBe('1:01:01')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./timer`.

- [ ] **Step 4: Implement the module**

Create `frontend/src/lib/timer.js`:
```js
export function elapsedSeconds(startMs, nowMs) {
  return Math.max(0, Math.floor((nowMs - startMs) / 1000))
}

export function remainingSeconds(startMs, targetSeconds, nowMs) {
  return Math.max(0, targetSeconds - elapsedSeconds(startMs, nowMs))
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const sec = String(s % 60).padStart(2, '0')
  const min = Math.floor(s / 60) % 60
  const hr = Math.floor(s / 3600)
  if (hr > 0) return `${hr}:${String(min).padStart(2, '0')}:${sec}`
  return `${min}:${sec}`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/test-setup.js frontend/src/lib/timer.js frontend/src/lib/timer.test.js
git commit -m "feat(frontend): timer logic module + Vitest setup"
```

---

### Task 3: TimerBar component wired into the Workout page

**Files:**
- Create: `frontend/src/components/TimerBar.jsx`
- Modify: `frontend/src/pages/Workout.jsx` (start session clock from `session.created_at`, start rest on `logSet`, render `<TimerBar>`)
- Modify: `frontend/src/index.css` (`.timer-bar`, `.timer-bar.flash`)

**Interfaces:**
- Consumes: `remainingSeconds`, `elapsedSeconds`, `formatClock` from `../lib/timer`.
- Props: `<TimerBar sessionStartMs={number} restStartMs={number|null} restTargetSec={number} onAddRest={(deltaSec)=>void} onSkipRest={()=>void} color={string} />`.
- Produces: a fixed bar above the nav showing the up-counting session clock and (when `restStartMs` is set) the down-counting rest timer with `−30s / +30s / Skip`; beeps + adds `.flash` class once when rest reaches 0.

- [ ] **Step 1: Add the bar styles**

In `frontend/src/index.css` append:
```css
.timer-bar {
  position: fixed; left: 0; right: 0; bottom: 64px; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 16px; max-width: 480px; margin: 0 auto;
  background: #14142a; border-top: 1px solid #1e1e32;
  font-family: 'JetBrains Mono', monospace;
}
.timer-bar.flash { animation: timerflash 0.4s ease-in-out 3; }
@keyframes timerflash { 50% { background: #234d34; } }
```
(`bottom: 64px` clears the existing bottom nav; adjust if the nav height differs — check `NavBar.jsx`.)

- [ ] **Step 2: Implement TimerBar**

Create `frontend/src/components/TimerBar.jsx`:
```jsx
import { useEffect, useRef, useState } from 'react'
import { remainingSeconds, elapsedSeconds, formatClock } from '../lib/timer'

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880; osc.connect(gain); gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch { /* audio not available */ }
}

export default function TimerBar({ sessionStartMs, restStartMs, restTargetSec, onAddRest, onSkipRest, color }) {
  const [now, setNow] = useState(Date.now())
  const [flash, setFlash] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // reset the "done" latch whenever a new rest period starts
  useEffect(() => { firedRef.current = false; setFlash(false) }, [restStartMs])

  const sessionStr = formatClock(elapsedSeconds(sessionStartMs, now))
  const resting = restStartMs != null
  const rem = resting ? remainingSeconds(restStartMs, restTargetSec, now) : 0

  useEffect(() => {
    if (resting && rem === 0 && !firedRef.current) {
      firedRef.current = true
      beep(); setFlash(true)
      setTimeout(() => setFlash(false), 1300)
    }
  }, [resting, rem])

  return (
    <div className={`timer-bar${flash ? ' flash' : ''}`}>
      <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
        ⏱ <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{sessionStr}</span>
      </div>
      {resting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-icon" onClick={() => onAddRest(-30)}>−30</button>
          <span style={{ color: rem === 0 ? '#6ee7b7' : color, fontWeight: 700, fontSize: '1.1rem', minWidth: 56, textAlign: 'center' }}>
            {formatClock(rem)}
          </span>
          <button className="btn-icon" onClick={() => onAddRest(30)}>+30</button>
          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={onSkipRest}>Skip</button>
        </div>
      ) : (
        <span style={{ color: '#4a5568', fontSize: '0.75rem' }}>Log a set to start rest timer</span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire it into Workout.jsx**

In `frontend/src/pages/Workout.jsx`:

Add the import near the top:
```jsx
import TimerBar from '../components/TimerBar'
```
Add state alongside the other `useState` calls:
```jsx
  const [restStartMs, setRestStartMs] = useState(null)
  const [restTargetSec, setRestTargetSec] = useState(90)
```
At the end of `logSet`, after a set is successfully added (inside the `try`, after `setSets(...)`), start the rest timer:
```jsx
      setRestStartMs(Date.now())
      setRestTargetSec(90)
```
Compute the session start (the row's `created_at` is UTC `"YYYY-MM-DD HH:MM:SS"`; parse as UTC). Just before the `return (`:
```jsx
  const sessionStartMs = session.created_at
    ? Date.parse(session.created_at.replace(' ', 'T') + 'Z')
    : Date.now()
```
Render the bar just inside the outermost `<div style={{ paddingTop: 24 }}>` (after the `{toast && ...}` line):
```jsx
      <TimerBar
        sessionStartMs={sessionStartMs}
        restStartMs={restStartMs}
        restTargetSec={restTargetSec}
        onAddRest={(d) => setRestTargetSec(t => Math.max(0, t + d))}
        onSkipRest={() => setRestStartMs(null)}
        color={color}
      />
```
Add bottom padding so the last button isn't hidden behind the fixed bar — change the outer wrapper to `style={{ paddingTop: 24, paddingBottom: 96 }}`.

- [ ] **Step 4: Verify the build and logic tests**

Run: `cd frontend && npm test && npm run build`
Expected: tests PASS, build succeeds with no errors.

- [ ] **Step 5: Manual smoke (dev)**

Run: `cd frontend && npm run dev`, open the app, start a workout, log a set → confirm the rest timer appears and counts down, `±30s`/`Skip` work, the session clock counts up, and a beep+flash fires at 0. (Backend must be running for set logging; or stub via the deployed API.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TimerBar.jsx frontend/src/pages/Workout.jsx frontend/src/index.css
git commit -m "feat(frontend): sticky timer bar with session clock + rest countdown"
```

---

### Task 4: Session summary pure-logic module

**Files:**
- Create: `frontend/src/lib/sessionStats.js`
- Test: `frontend/src/lib/sessionStats.test.js`

**Interfaces:**
- Produces: `summarize(sets: Array<{exercise_id, exercise_name, weight_kg, reps}>, prsBefore: Record<exercise_id, number>): { totalSets, totalVolume, exerciseCount, prs: Array<{name, weight}> }`
  - `totalVolume` = Σ `weight_kg * reps`.
  - `exerciseCount` = number of distinct `exercise_id`.
  - `prs` = one entry per exercise whose best set this session exceeds `prsBefore[exercise_id]` (or where no prior PR existed), `weight` = that best weight.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/sessionStats.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { summarize } from './sessionStats'

const sets = [
  { exercise_id: 'bench_press', exercise_name: 'Bench Press', weight_kg: 60, reps: 8 },
  { exercise_id: 'bench_press', exercise_name: 'Bench Press', weight_kg: 65, reps: 6 },
  { exercise_id: 'bent_row', exercise_name: 'Bent-over Row', weight_kg: 50, reps: 10 },
]

describe('summarize', () => {
  it('totals sets and volume', () => {
    const r = summarize(sets, {})
    expect(r.totalSets).toBe(3)
    expect(r.totalVolume).toBe(60*8 + 65*6 + 50*10) // 1370
    expect(r.exerciseCount).toBe(2)
  })
  it('reports PRs only when exceeding prior best', () => {
    const r = summarize(sets, { bench_press: 62, bent_row: 50 })
    // bench best 65 > 62 -> PR; row best 50 not > 50 -> no PR
    expect(r.prs).toEqual([{ name: 'Bench Press', weight: 65 }])
  })
  it('counts first-time lifts as PRs', () => {
    const r = summarize(sets, {})
    expect(r.prs).toContainEqual({ name: 'Bench Press', weight: 65 })
    expect(r.prs).toContainEqual({ name: 'Bent-over Row', weight: 50 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./sessionStats`.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/sessionStats.js`:
```js
export function summarize(sets, prsBefore = {}) {
  const totalSets = sets.length
  const totalVolume = sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)

  const bestByEx = {}      // exercise_id -> { name, weight }
  for (const s of sets) {
    const cur = bestByEx[s.exercise_id]
    if (!cur || s.weight_kg > cur.weight) {
      bestByEx[s.exercise_id] = { name: s.exercise_name, weight: s.weight_kg }
    }
  }

  const exerciseCount = Object.keys(bestByEx).length
  const prs = Object.entries(bestByEx)
    .filter(([id, best]) => prsBefore[id] == null || best.weight > prsBefore[id])
    .map(([, best]) => ({ name: best.name, weight: best.weight }))

  return { totalSets, totalVolume, exerciseCount, prs }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sessionStats.js frontend/src/lib/sessionStats.test.js
git commit -m "feat(frontend): session summary stats module"
```

---

### Task 5: Finish summary screen + duration in History

**Files:**
- Modify: `frontend/src/pages/Workout.jsx` (show summary on finish instead of navigating immediately)
- Modify: `frontend/src/pages/History.jsx` (show duration for completed sessions)

**Interfaces:**
- Consumes: `summarize` from `../lib/sessionStats`; `formatClock`/`elapsedSeconds` from `../lib/timer`; existing `prs` state in `Workout.jsx`; `ended_at` + `created_at` fields from the API (Task 1).

- [ ] **Step 1: Add summary state and capture stats on finish (Workout.jsx)**

Add state:
```jsx
  const [summary, setSummary] = useState(null)
```
Rewrite `finishWorkout` to PATCH, then compute the summary and show it instead of navigating:
```jsx
  async function finishWorkout() {
    if (finishing) return
    setFinishing(true)
    try {
      const updated = await api.patch(`/sessions/${sessionId}`, { completed: true })
      const { summarize } = await import('../lib/sessionStats')
      const stats = summarize(sets, prs)
      const durSec = updated.ended_at && session.created_at
        ? Math.max(0, Math.round(
            (Date.parse(updated.ended_at.replace(' ', 'T') + 'Z') -
             Date.parse(session.created_at.replace(' ', 'T') + 'Z')) / 1000))
        : elapsedSeconds(sessionStartMs, Date.now())
      setSummary({ ...stats, durSec })
    } catch (e) {
      alert('Failed to finish session.')
      setFinishing(false)
    }
  }
```
Add the import at top: `import { formatClock, elapsedSeconds } from '../lib/timer'` (merge with the existing `../lib/timer` import if added earlier).

- [ ] **Step 2: Render the summary card (Workout.jsx)**

Immediately after `if (!session) return ...`, add an early return for the summary:
```jsx
  if (summary) return (
    <div style={{ paddingTop: 48 }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 16 }}>Workout complete 🎉</h1>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <Stat label="Duration" value={formatClock(summary.durSec)} />
        <Stat label="Sets" value={summary.totalSets} />
        <Stat label="Volume" value={`${summary.totalVolume.toLocaleString()} kg`} />
        <Stat label="Exercises" value={summary.exerciseCount} />
        {summary.prs.length > 0 && (
          <p style={{ color: '#fbbf24', fontSize: '0.85rem', marginTop: 12 }}>
            🏆 {summary.prs.length} PR{summary.prs.length !== 1 ? 's' : ''}: {summary.prs.map(p => `${p.name} ${p.weight}kg`).join(', ')}
          </p>
        )}
      </div>
      <button className="btn-primary" onClick={() => nav('/')}>Done → Home</button>
    </div>
  )
```
Add a small `Stat` helper component above `export default function Workout()`:
```jsx
function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e1e32' }}>
      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{label}</span>
      <span className="font-mono" style={{ color: '#fff', fontWeight: 700 }}>{value}</span>
    </div>
  )
}
```

- [ ] **Step 3: Show duration in History.jsx**

Add a helper near the top of the module (above `export default`):
```jsx
function sessionDuration(s) {
  if (!s.completed || !s.ended_at || !s.created_at) return null
  const ms = Date.parse(s.ended_at.replace(' ', 'T') + 'Z') - Date.parse(s.created_at.replace(' ', 'T') + 'Z')
  if (ms <= 0) return null
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m%60}m`
}
```
In the session header subtitle line, append the duration when present. Replace:
```jsx
                  {s.date} {s.completed ? '· ✓ completed' : '· in progress'}
```
with:
```jsx
                  {s.date} {s.completed ? '· ✓ completed' : '· in progress'}
                  {sessionDuration(s) ? ` · ⏱ ${sessionDuration(s)}` : ''}
```

- [ ] **Step 4: Verify build + tests**

Run: `cd frontend && npm test && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Workout.jsx frontend/src/pages/History.jsx
git commit -m "feat(frontend): finish summary screen + session duration in history"
```

---

### Task 6: Demo resolver script + committed `exerciseDemos.json` + lookup helper

**Files:**
- Create: `frontend/scripts/resolve-demos.mjs`
- Create: `frontend/src/data/exerciseDemos.json`
- Create: `frontend/src/lib/demos.js`
- Test: `frontend/src/lib/demos.test.js`
- Modify: `frontend/package.json` (add `"resolve-demos"` script)

**Interfaces:**
- Produces:
  - `frontend/src/data/exerciseDemos.json` — `{ "<exercise_id>": "<gifUrl>", ... }` (committed).
  - `getDemoUrl(exerciseId: string, demos = DEMOS): string | null` in `frontend/src/lib/demos.js`.

- [ ] **Step 1: Write the failing test for the lookup helper**

Create `frontend/src/lib/demos.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { getDemoUrl } from './demos'

const demos = { bench_press: 'https://cdn.example/bench.gif' }

describe('getDemoUrl', () => {
  it('returns the url when present', () => {
    expect(getDemoUrl('bench_press', demos)).toBe('https://cdn.example/bench.gif')
  })
  it('returns null when missing or empty', () => {
    expect(getDemoUrl('unknown', demos)).toBeNull()
    expect(getDemoUrl('x', { x: '' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./demos`.

- [ ] **Step 3: Create the (initially empty) data file + helper**

Create `frontend/src/data/exerciseDemos.json`:
```json
{}
```
Create `frontend/src/lib/demos.js`:
```js
import DEMOS from '../data/exerciseDemos.json'

export function getDemoUrl(exerciseId, demos = DEMOS) {
  const url = demos[exerciseId]
  return url ? url : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Write the resolver script**

Create `frontend/scripts/resolve-demos.mjs`:
```js
// Resolve ExerciseDB GIF URLs for each exercise in workoutPlan.js into
// src/data/exerciseDemos.json. Run on the Mac with RAPIDAPI_KEY set.
// Usage: RAPIDAPI_KEY=xxxx node scripts/resolve-demos.mjs
import { writeFileSync } from 'node:fs'
import { PLAN } from '../src/data/workoutPlan.js'

const KEY = process.env.RAPIDAPI_KEY
if (!KEY) { console.error('Set RAPIDAPI_KEY'); process.exit(1) }

const HOST = 'exercisedb.p.rapidapi.com'
const headers = { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST }

// ExerciseDB search terms for names that won't auto-match our labels.
const OVERRIDES = {
  bent_row: 'bent over row',
  ohp: 'barbell shoulder press',
  lat_pulldown: 'cable pulldown',
}

function searchTerm(ex) {
  return OVERRIDES[ex.id] || ex.name.toLowerCase()
}

async function resolveOne(ex) {
  const term = encodeURIComponent(searchTerm(ex))
  const res = await fetch(`https://${HOST}/exercises/name/${term}?limit=1`, { headers })
  if (!res.ok) { console.warn(`  ${ex.id}: HTTP ${res.status}`); return null }
  const arr = await res.json()
  const hit = Array.isArray(arr) && arr[0]
  return hit?.gifUrl || null
}

const seen = new Set()
const out = {}
for (const day of Object.values(PLAN)) {
  for (const ex of day.exercises) {
    if (seen.has(ex.id)) continue
    seen.add(ex.id)
    const url = await resolveOne(ex)
    if (url) { out[ex.id] = url; console.log(`  ${ex.id} -> ok`) }
    else console.warn(`  ${ex.id} -> no demo (will fall back to YouTube)`)
  }
}

writeFileSync(new URL('../src/data/exerciseDemos.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n')
console.log(`Wrote ${Object.keys(out).length} demos.`)
```
Add to `frontend/package.json` `"scripts"`:
```json
    "resolve-demos": "node scripts/resolve-demos.mjs"
```

- [ ] **Step 6: Run the resolver to populate real data**

Run (on the Mac, with a RapidAPI key subscribed to ExerciseDB):
```bash
cd frontend && RAPIDAPI_KEY=<your-key> npm run resolve-demos
```
Expected: console lists each exercise `-> ok` or `-> no demo`; `src/data/exerciseDemos.json` now contains GIF URLs. Re-run tests to confirm nothing broke: `npm test`.
> If you don't have a key yet, leave `exerciseDemos.json` as `{}` — every exercise falls back to YouTube (Task 7) and you can populate it later by re-running this step and re-deploying.

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts/resolve-demos.mjs frontend/src/data/exerciseDemos.json frontend/src/lib/demos.js frontend/src/lib/demos.test.js frontend/package.json
git commit -m "feat(frontend): build-time ExerciseDB demo resolver + lookup helper"
```

---

### Task 7: Render inline demo with YouTube fallback (Exercise.jsx)

**Files:**
- Modify: `frontend/src/pages/Exercise.jsx` (replace the YouTube-search button with a demo image, fall back to the link)

**Interfaces:**
- Consumes: `getDemoUrl` from `../lib/demos`; existing `ex.ytUrl`.

- [ ] **Step 1: Replace the "Video demo" block**

In `frontend/src/pages/Exercise.jsx`, add the import:
```jsx
import { getDemoUrl } from '../lib/demos'
```
Inside the component, after `const color = ...`, compute and track image-load failure:
```jsx
  const demoUrl = getDemoUrl(exerciseId)
```
Add near the other hooks (top of component, before the early `if (!ex)`):
```jsx
  const [demoFailed, setDemoFailed] = useState(false)
```
And add `import { useState } from 'react'` to the existing react-router import line's file (add a separate `import { useState } from 'react'`).

Replace the entire `{/* Video demo */}` `<a>...</a>` plus the trailing `<p>` hint with:
```jsx
      {/* Demo */}
      {demoUrl && !demoFailed ? (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Demo
          </p>
          <img src={demoUrl} alt={`${ex.name} demonstration`} loading="lazy"
            onError={() => setDemoFailed(true)}
            style={{ width: '100%', borderRadius: 10, display: 'block', background: '#1e1e32' }} />
        </div>
      ) : (
        <>
          <a href={ex.ytUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#1e1e32', border: `1px solid ${color}44`,
              borderRadius: 12, padding: '16px 20px', color,
              textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem'
            }}>
            <span style={{ fontSize: '1.4rem' }}>▶</span>
            Watch form demo on YouTube
          </a>
          <p style={{ color: '#4a5568', fontSize: '0.7rem', textAlign: 'center', marginTop: 10 }}>
            Opens a YouTube search — pick a video from Jeff Nippard or Alan Thrall for evidence-based technique
          </p>
        </>
      )}
```

- [ ] **Step 2: Verify build + tests**

Run: `cd frontend && npm test && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 3: Manual smoke (dev)**

Run `npm run dev`; open an exercise that has a resolved demo → the looping GIF shows. Temporarily break a URL in `exerciseDemos.json` → confirm it falls back to the YouTube link without looking broken.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Exercise.jsx
git commit -m "feat(frontend): inline exercise demo with YouTube fallback"
```

---

### Task 8: Build, deploy to the Pi, verify

**Files:** none (deploy only).

- [ ] **Step 1: Build the image on the Mac**

```bash
cd ~/dev/workout-tracker
docker buildx build --platform linux/arm64 -t kapekost/workout-tracker:latest --load .
```
Expected: build succeeds (Vite build runs inside the image; the test deps are not needed there).

- [ ] **Step 2: Transfer to the Pi (no registry)**

```bash
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@192.168.1.170 'gunzip | docker load'
```

- [ ] **Step 3: Restart on the Pi**

```bash
ssh kapekost@192.168.1.170 'cd ~/workout-tracker && docker compose up -d'
```

- [ ] **Step 4: Verify app + co-tenant health**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.170:8080/   # expect 200
ssh kapekost@192.168.1.170 'docker ps --format "{{.Names}} {{.Status}}" | grep -E "workout|homeassistant"'
```
Expected: app `200`; `homeassistant` still `healthy`; workout container `Up`.
Then on a phone: start a workout (timer bar + rest countdown), finish (summary card), check History (duration), open an exercise (inline demo or YouTube fallback).

- [ ] **Step 5: Update AGENTS.md status + commit**

Append the new features to the **Status → Done** list in `AGENTS.md`, then:
```bash
git add AGENTS.md
git commit -m "docs: update status — timer, session tracking, inline demos shipped"
```

---

## Notes for the implementer
- The existing `Workout.jsx` already loads PRs into a `prs` state map keyed by `exercise_id` — Task 5 reuses it for the summary; don't refetch.
- `created_at`/`ended_at` come from SQLite as space-separated UTC strings; always parse with `.replace(' ', 'T') + 'Z'` so phones in any timezone compute correct durations.
- ExerciseDB GIF URLs may change upstream; the YouTube fallback (Task 7) is the safety net, and re-running `npm run resolve-demos` + redeploying refreshes them.
