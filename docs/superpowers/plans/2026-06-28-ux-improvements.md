# UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the gym tracker reliable and usable mid-set: keep the screen awake, non-blocking feedback, a glanceable high-contrast timer, AA contrast, big tap targets, reduced-motion, and a faster logging loop (auto-advance, per-exercise prefill, typeable weight).

**Architecture:** Frontend-only. Pure logic (`workoutFlow.js`) is Vitest-tested; a `useWakeLock` hook isolates the Screen Wake Lock API; the rest are component/CSS changes verified by build + manual smoke.

**Tech Stack:** React 18 + Vite, Vitest. No new runtime deps.

## Global Constraints
- No backend changes. No new runtime npm dependencies.
- iOS standalone PWA: Wake Lock is iOS 16.4+; **Vibration API unsupported on iOS** — always guard `navigator.vibrate?.(...)` and `'wakeLock' in navigator`.
- Never reintroduce blocking `alert()`/`confirm()` — they freeze the running timer.
- Timer values stay timestamp-derived (do not change that).
- Tap targets ≥44px. Contrast: informational text ≥ `#9ca3af` on the dark bg.
- Keep the existing dark theme, per-day accent, and TimerBar timestamp logic intact.

---

### Task 1: `workoutFlow` pure helpers (TDD)

**Files:**
- Create: `frontend/src/lib/workoutFlow.js`
- Test: `frontend/src/lib/workoutFlow.test.js`

**Interfaces — Produces:**
- `nextIncompleteExerciseId(exercises, sets)` → first `exercises[i].id` whose count of `sets` with that `exercise_id` is `< exercises[i].sets`, else `null`. (`exercises` items have `{id, sets}`; `sets` items have `{exercise_id}`.)
- `prefillFor(exerciseId, sets, progressMaxByExercise = {})` → `{weight, reps}`: last logged set of that exercise in `sets` (`{weight: last.weight_kg, reps: last.reps}`); else `{weight: progressMaxByExercise[exerciseId], reps: 8}` if defined; else `{weight: 20, reps: 8}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { nextIncompleteExerciseId, prefillFor } from './workoutFlow'

const exercises = [{ id: 'a', sets: 2 }, { id: 'b', sets: 3 }]

describe('nextIncompleteExerciseId', () => {
  it('returns the first exercise with no sets', () => {
    expect(nextIncompleteExerciseId(exercises, [])).toBe('a')
  })
  it('skips a completed exercise', () => {
    const sets = [{ exercise_id: 'a' }, { exercise_id: 'a' }]
    expect(nextIncompleteExerciseId(exercises, sets)).toBe('b')
  })
  it('returns null when all complete', () => {
    const sets = [{ exercise_id: 'a' }, { exercise_id: 'a' },
                  { exercise_id: 'b' }, { exercise_id: 'b' }, { exercise_id: 'b' }]
    expect(nextIncompleteExerciseId(exercises, sets)).toBeNull()
  })
})

describe('prefillFor', () => {
  it('uses the last set of that exercise this session', () => {
    const sets = [{ exercise_id: 'a', weight_kg: 60, reps: 8 },
                  { exercise_id: 'a', weight_kg: 65, reps: 6 }]
    expect(prefillFor('a', sets)).toEqual({ weight: 65, reps: 6 })
  })
  it('falls back to progress max with 8 reps', () => {
    expect(prefillFor('a', [], { a: 50 })).toEqual({ weight: 50, reps: 8 })
  })
  it('defaults to 20kg x 8 when nothing known', () => {
    expect(prefillFor('a', [], {})).toEqual({ weight: 20, reps: 8 })
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd frontend && npm test`  → FAIL (cannot resolve `./workoutFlow`).

- [ ] **Step 3: Implement**

```js
export function nextIncompleteExerciseId(exercises, sets) {
  for (const ex of exercises) {
    const done = sets.filter(s => s.exercise_id === ex.id).length
    if (done < ex.sets) return ex.id
  }
  return null
}

export function prefillFor(exerciseId, sets, progressMaxByExercise = {}) {
  const exSets = sets.filter(s => s.exercise_id === exerciseId)
  if (exSets.length) {
    const last = exSets[exSets.length - 1]
    return { weight: last.weight_kg, reps: last.reps }
  }
  const pm = progressMaxByExercise[exerciseId]
  if (pm != null) return { weight: pm, reps: 8 }
  return { weight: 20, reps: 8 }
}
```

- [ ] **Step 4: Run test, verify pass.** `cd frontend && npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/workoutFlow.js frontend/src/lib/workoutFlow.test.js
git commit -m "feat(frontend): workoutFlow helpers (next incomplete + prefill)"
```

---

### Task 2: Screen Wake Lock hook + Workout integration + TimerBar status pill

**Files:**
- Create: `frontend/src/lib/useWakeLock.js`
- Modify: `frontend/src/pages/Workout.jsx` (call the hook, pass status to TimerBar)
- Modify: `frontend/src/components/TimerBar.jsx` (show `🔆 Screen on` pill)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `useWakeLock(active) → { supported: boolean, held: boolean }`. TimerBar gains a `wakeLockHeld` prop.

- [ ] **Step 1: Create the hook**

```js
import { useEffect, useRef, useState } from 'react'

// Keeps the screen awake while `active`. Re-acquires on tab re-focus (the lock
// auto-releases when the tab hides). No-op where unsupported.
export function useWakeLock(active) {
  const lockRef = useRef(null)
  const [held, setHeld] = useState(false)
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator

  useEffect(() => {
    if (!active || !supported) return
    let cancelled = false

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        lockRef.current = lock
        setHeld(true)
        lock.addEventListener('release', () => setHeld(false))
      } catch { setHeld(false) }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const l = lockRef.current
      lockRef.current = null
      setHeld(false)
      if (l) l.release().catch(() => {})
    }
  }, [active, supported])

  return { supported, held }
}
```

- [ ] **Step 2: Use it in Workout.jsx**

Add import: `import { useWakeLock } from '../lib/useWakeLock'`.
Inside the component (top, with other hooks — before any early return):
```jsx
  const { held: wakeLockHeld } = useWakeLock(true)
```
Pass to TimerBar: add the prop `wakeLockHeld={wakeLockHeld}` to the existing `<TimerBar ... />`.

- [ ] **Step 3: Show the pill in TimerBar.jsx**

Add `wakeLockHeld` to the props destructure. In the left cluster (next to the session clock), render when held:
```jsx
      {wakeLockHeld && (
        <span style={{ color: '#6ee7b7', fontSize: '0.6rem', fontWeight: 700, marginLeft: 8 }}>🔆 On</span>
      )}
```

- [ ] **Step 4: Verify** — `cd frontend && npm test` (existing pass) and `npm run build` (succeeds). Manual smoke not runnable here; note as not-run.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useWakeLock.js frontend/src/pages/Workout.jsx frontend/src/components/TimerBar.jsx
git commit -m "feat(frontend): keep screen awake during workout (Wake Lock)"
```

---

### Task 3: Non-blocking feedback + vibration (kill alert/confirm)

**Files:**
- Modify: `frontend/src/index.css` (add `.toast.error`)
- Modify: `frontend/src/pages/Workout.jsx` (error toasts; vibration already in TimerBar — see below)
- Modify: `frontend/src/components/TimerBar.jsx` (vibrate at 0)
- Modify: `frontend/src/pages/Home.jsx` (local toast; replace alert)
- Modify: `frontend/src/pages/History.jsx` (local toast + inline two-tap delete)

**Interfaces:** `showToast(msg, type)` where `type ∈ {'success','error'}` (default `'success'`).

- [ ] **Step 1: Add error toast style** — in `index.css` after `.toast {...}`:
```css
.toast.error { background: #ef4444; color: #fff; }
```

- [ ] **Step 2: Workout.jsx — typed toast + replace alerts**

Change `showToast` to accept a type and store it:
```jsx
  const [toast, setToast] = useState(null) // { msg, type }
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }
```
Update the toast render:
```jsx
      {toast && <div className={`toast${toast.type === 'error' ? ' error' : ''}`}>{toast.msg}</div>}
```
Update the existing PR toast call to `showToast(\`🏆 PR! ${weight}kg on ${ex.name}\`)` (unchanged — defaults to success).
Replace the three `alert(...)` calls:
- set-log fail → `showToast('Failed to log set', 'error')`
- delete-set fail → `showToast('Failed to delete set', 'error')`
- finish fail → `showToast('Failed to finish session', 'error')` (keep `setFinishing(false)`)

- [ ] **Step 3: TimerBar.jsx — vibrate at 0**

In the effect that fires the beep+flash at `rem === 0`, add after `beep()`:
```jsx
        navigator.vibrate?.([300, 150, 300])
```

- [ ] **Step 4: Home.jsx — local toast, replace alert**

Add toast state + render (mirror Workout):
```jsx
  const [toast, setToast] = useState(null)
```
At the top of the returned JSX (inside the outer div), add:
```jsx
      {toast && <div className="toast error">{toast}</div>}
```
Replace `alert('Failed to start session. Is the backend running?')` with:
```jsx
      setToast('Failed to start — is the backend up?')
      setTimeout(() => setToast(null), 2500)
```

- [ ] **Step 5: History.jsx — local toast + inline two-tap delete**

Add state:
```jsx
  const [confirmId, setConfirmId] = useState(null)
  const [toast, setToast] = useState(null)
```
Add toast render at top of returned JSX:
```jsx
      {toast && <div className="toast error">{toast}</div>}
```
Replace `deleteSession` body (remove `confirm`):
```jsx
  async function deleteSession(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      setTimeout(() => setConfirmId(c => (c === id ? null : c)), 3000)
      return
    }
    setConfirmId(null)
    try {
      await api.delete(`/sessions/${id}`)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (expanded === id) setExpanded(null)
    } catch {
      setToast('Failed to delete')
      setTimeout(() => setToast(null), 2500)
    }
  }
```
Update the delete button label to reflect the pending state:
```jsx
                  {confirmId === s.id ? 'Tap again to confirm' : 'Delete session'}
```

- [ ] **Step 6: Verify** — `npm test` (pass) + `npm run build` (succeeds). Confirm no `alert(`/`confirm(` remain: `grep -rn "alert(\|confirm(" frontend/src` returns nothing.
- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/pages/Workout.jsx frontend/src/components/TimerBar.jsx frontend/src/pages/Home.jsx frontend/src/pages/History.jsx
git commit -m "feat(frontend): non-blocking toasts + inline delete confirm + vibration"
```

---

### Task 4: TimerBar glanceability redesign + reduced-motion

**Files:**
- Modify: `frontend/src/components/TimerBar.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Redesign the bar (TimerBar.jsx)**

Make the rest countdown the hero and add a REST/GO label. Replace the resting branch's countdown markup so the number is large near-white and a label shows state:
```jsx
      {resting ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-icon" aria-label="subtract 30 seconds" onClick={() => onAddRest(-30)}>−30</button>
          <div style={{ textAlign: 'center', minWidth: 88 }}>
            <div style={{ color: rem === 0 ? '#6ee7b7' : '#9ca3af', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em' }}>
              {rem === 0 ? 'GO' : 'REST'}
            </div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '2.2rem', lineHeight: 1 }}>
              {formatClock(rem)}
            </div>
          </div>
          <button className="btn-icon" aria-label="add 30 seconds" onClick={() => onAddRest(30)}>+30</button>
          <button className="btn-secondary" aria-label="skip rest" style={{ minHeight: 44, fontSize: '0.75rem', padding: '4px 12px' }} onClick={onSkipRest}>Skip</button>
        </div>
      ) : (
        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Log a set to start rest timer</span>
      )}
```
Demote the session clock (left cluster) to small muted: keep `⏱` with the value at `fontSize 0.8rem`, color `#9ca3af` (already similar — ensure label color is `#9ca3af`).

- [ ] **Step 2: Reduced-motion + skip flash when reduced**

At the top of the flash effect, guard the visual flash (keep beep + vibrate):
```jsx
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      beep(); navigator.vibrate?.([300,150,300])
      if (!reduce) { setFlash(true); setTimeout(() => setFlash(false), 1300) }
```
(Adjust the existing block so beep/vibrate always run and only `setFlash` is gated. Remove the duplicate vibrate added in Task 3 if it now lives here — keep exactly one vibrate call at zero.)

- [ ] **Step 3: CSS — safe-area + reduced-motion**

In `index.css`, update `.timer-bar` to respect the home indicator and add a reduced-motion block:
```css
.timer-bar { /* ...existing... */ bottom: calc(64px + env(safe-area-inset-bottom)); }

@media (prefers-reduced-motion: reduce) {
  .timer-bar.flash { animation: none; }
  .toast { animation: none; }
}
```

- [ ] **Step 4: Verify** — `npm test` + `npm run build`. Confirm exactly one `navigator.vibrate` call in TimerBar (`grep -n vibrate frontend/src/components/TimerBar.jsx`).
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TimerBar.jsx frontend/src/index.css
git commit -m "feat(frontend): glanceable timer (big countdown, REST/GO) + reduced-motion"
```

---

### Task 5: Contrast tokens, tap targets, nav, demo reduced-motion

**Files:**
- Modify: `frontend/src/index.css` (tokens, `.btn-icon` 44px)
- Modify: `frontend/src/components/NavBar.jsx` (contrast + 48px)
- Modify: `frontend/src/pages/Workout.jsx` (set-delete × 44px hit area)
- Modify: `frontend/src/pages/Exercise.jsx` (reduced-motion gate on demo interval)
- Modify (contrast sweep): `frontend/src/pages/{Home,History,Progress,Workout,Exercise}.jsx`

- [ ] **Step 1: Tokens + btn-icon size (index.css)**

Add to `:root`: `--muted: #9ca3af; --muted-2: #6b7280;`
Change `.btn-icon` `width: 40px; height: 40px;` → `width: 44px; height: 44px;`

- [ ] **Step 2: NavBar contrast + height**

In `NavBar.jsx`, change the inactive color `#4a5568` → `#9ca3af` (both icon and label), and add `minHeight: 48` to the button style.

- [ ] **Step 3: Set-delete × hit area (Workout.jsx)**

In `SetRow`, change the `×` button style to a 44px hit area:
```jsx
        <button onClick={() => onDelete(s.id)} aria-label="delete set"
          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
            fontSize: '1.1rem', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ×
        </button>
```

- [ ] **Step 4: Contrast sweep**

In Home/History/Progress/Workout/Exercise, replace informational text color `#4a5568` with `#9ca3af` (the faint "Loading…", hints, secondary empty-state lines, chevrons that carry meaning). Leave `#6b7280` where it is a large/secondary label, but raise any `#6b7280` used for small body text (dates, set labels) to `#9ca3af`. Do a pass per file:
```bash
grep -rn "#4a5568" frontend/src
```
Replace each occurrence used for readable text with `#9ca3af`. (Purely decorative separators may stay.)

- [ ] **Step 5: Exercise demo reduced-motion (Exercise.jsx)**

In the frame-alternation effect, do not start the interval when reduced motion is preferred:
```jsx
  useEffect(() => {
    setFrameIdx(0)
    setDemoFailed(false)
    if (!frames || frames.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setFrameIdx(i => (i + 1) % frames.length), 900)
    return () => clearInterval(id)
  }, [exerciseId, frames])
```

- [ ] **Step 6: Verify** — `npm test` + `npm run build`. Spot-check no readable text still uses `#4a5568`: `grep -rn "#4a5568" frontend/src` (remaining hits should be decorative only).
- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/components/NavBar.jsx frontend/src/pages/Workout.jsx frontend/src/pages/Exercise.jsx frontend/src/pages/Home.jsx frontend/src/pages/History.jsx frontend/src/pages/Progress.jsx
git commit -m "feat(frontend): AA contrast tokens, 44px tap targets, demo reduced-motion"
```

---

### Task 6: Logging loop — auto-expand/advance + per-exercise prefill + typeable steppers

**Files:**
- Modify: `frontend/src/pages/Workout.jsx`

**Interfaces — Consumes:** `nextIncompleteExerciseId`, `prefillFor` from `../lib/workoutFlow` (Task 1).

- [ ] **Step 1: Import helpers**

`import { nextIncompleteExerciseId, prefillFor } from '../lib/workoutFlow'`

- [ ] **Step 2: Auto-expand first incomplete on load**

After the session + sets load resolves (in the `.then` that calls `setSets(s.sets || [])`), set the initial expansion and prefill:
```jsx
      const firstId = nextIncompleteExerciseId(PLAN[s.workout_day].exercises, s.sets || [])
      if (firstId) {
        setExpanded(firstId)
        const pf = prefillFor(firstId, s.sets || [], {})
        setWeight(pf.weight); setReps(pf.reps)
      }
```
(`prs` for progress fallback isn't loaded yet here; this-session sets + default are sufficient on load. Auto-advance below uses the loaded `prs`.)

- [ ] **Step 3: Prefill when the user manually expands an exercise**

Replace the exercise-header `onClick={() => setExpanded(isOpen ? null : ex.id)}` with a handler that also prefills on open:
```jsx
              onClick={() => {
                const opening = !isOpen
                setExpanded(opening ? ex.id : null)
                if (opening) {
                  const pf = prefillFor(ex.id, sets, prs)
                  setWeight(pf.weight); setReps(pf.reps)
                }
              }}
```

- [ ] **Step 4: Auto-advance after completing an exercise (in logSet)**

After the optimistic set append in `logSet`, compute the new sets and advance if this exercise just hit its target. Replace the rest-start lines so they run alongside advance logic:
```jsx
      const newSets = [...sets, newSet]
      setSets(newSets)
      // ...existing PR detection unchanged...
      setRestStartMs(Date.now())
      setRestTargetSec(90)
      // auto-advance when this exercise reached its target
      const doneForEx = newSets.filter(s => s.exercise_id === ex.id).length
      if (doneForEx >= ex.sets) {
        const nextId = nextIncompleteExerciseId(plan.exercises, newSets)
        if (nextId && nextId !== ex.id) {
          setExpanded(nextId)
          const pf = prefillFor(nextId, newSets, prs)
          setWeight(pf.weight); setReps(pf.reps)
        }
      }
```
NOTE: the existing code uses `setSets(prev => [...prev, newSet])`. Switch to the `newSets` local above so the advance check sees the updated list synchronously. Keep PR detection logic intact (it reads `prs`/`weight`).

- [ ] **Step 5: Typeable steppers (NumControl)**

Make the input editable. Update `NumControl` to accept typed input and clamp:
```jsx
function NumControl({ value, onChange, step = 1, min = 0, mode = 'numeric' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button className="btn-icon" aria-label="decrease" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input type="number" value={value} inputMode={mode}
        onChange={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : v) }}
        onBlur={e => { const v = parseFloat(e.target.value); onChange(Number.isNaN(v) ? min : Math.max(min, v)) }}
        style={{ width: 72, textAlign: 'center', background: '#1e1e32', border: 'none', borderRadius: 8,
          color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: 700, padding: '8px 0' }} />
      <button className="btn-icon" aria-label="increase" onClick={() => onChange(value + step)}>+</button>
    </div>
  )
}
```
Pass `mode="decimal"` to the weight `NumControl` and leave reps default.

- [ ] **Step 6: Verify** — `npm test` (Task 1 helpers + existing all pass) + `npm run build`. Manual smoke not runnable here; note as not-run.
- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Workout.jsx
git commit -m "feat(frontend): faster logging — auto-advance, per-exercise prefill, typeable weight"
```

---

### Task 7: Build, deploy to Pi, verify

- [ ] **Step 1: Build** — `cd ~/dev/workout-tracker && docker buildx build --platform linux/arm64 -t kapekost/workout-tracker:latest --load .`
- [ ] **Step 2: Smoke locally** — run the image on :8099 with a temp volume; confirm `GET /` 200 and `GET /manifest.webmanifest` 200; remove container.
- [ ] **Step 3: Transfer** — `docker save kapekost/workout-tracker:latest | gzip | ssh -i ~/.ssh/id_raspi kapekost@192.168.1.170 'gunzip | docker load'`
- [ ] **Step 4: Restart on Pi** — `ssh -i ~/.ssh/id_raspi kapekost@192.168.1.170 'cd ~/workout-tracker && docker compose up -d'`
- [ ] **Step 5: Verify** — app `200`, container `Up`, `homeassistant` still `healthy`. Then on phone: start a workout, lock-check the screen stays on, log a set (rest timer big + REST/GO), confirm auto-advance + prefill, finish.
- [ ] **Step 6: Update AGENTS.md status + commit.**

---

## Notes for the implementer
- Don't change the TimerBar timestamp math; only presentation + cues change.
- After Task 3, there must be zero `alert(`/`confirm(` in `frontend/src`.
- After Task 4, exactly one `navigator.vibrate` call (in TimerBar at rest 0).
- Per-exercise prefill uses this-session sets first; `prs` (max weight map already loaded in Workout) is the progress fallback.
