# Resume In-Progress Workout Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user a path back to an in-progress workout session from any page, prevent duplicate in-progress sessions, and allow discarding an abandoned one.

**Architecture:** A single React context (`ActiveSessionProvider`) holds the most-recent incomplete session as shared state. A global `ResumeBanner` (in the sticky header) and the `Home` page both read it; `Home`'s primary button and `Workout`'s finish flow keep it fresh. Frontend-only — no backend changes.

**Tech Stack:** React 18 + react-router-dom 6, Vite, Vitest + @testing-library/react (jsdom). The API client is `src/api.js` (`api.get/post/patch/delete`).

## Global Constraints

- No backend changes. `GET /api/sessions` returns sessions ordered `created_at DESC` each with a `completed` flag; `DELETE /api/sessions/{id}` cascades to the session's sets.
- "Active session" = the most-recent session with falsy `completed`.
- Workout day metadata comes from `PLAN[workout_day]` and `DAY_COLORS[workout_day]` in `src/data/workoutPlan.js` (keys: `upper_a`, `lower_a`, `upper_b`, `lower_b`). Always guard for a `workout_day` missing from `PLAN`.
- Tests run with `npm test` (i.e. `vitest run`) from `frontend/`. Test setup file `src/test-setup.js` provides jest-dom matchers; `globals: true` so `describe/it/expect` are global, but import `vi` from `vitest`.
- Follow the existing prop-driven presentational-component test pattern (cf. `src/pages/History.test.jsx`).

---

### Task 1: `findActiveSession` selector

**Files:**
- Create: `frontend/src/lib/activeSession.jsx`
- Test: `frontend/src/lib/activeSession.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `findActiveSession(sessions) -> session | null` — given the sessions list (already `created_at DESC`), returns the first entry with falsy `completed`, else `null`; returns `null` for non-array input.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/activeSession.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { findActiveSession } from './activeSession'

describe('findActiveSession', () => {
  it('returns null for empty or non-array input', () => {
    expect(findActiveSession([])).toBeNull()
    expect(findActiveSession(undefined)).toBeNull()
  })

  it('returns null when all sessions are completed', () => {
    expect(findActiveSession([{ id: 1, completed: 1 }, { id: 2, completed: 1 }])).toBeNull()
  })

  it('returns the incomplete session', () => {
    const s = { id: 3, completed: 0 }
    expect(findActiveSession([{ id: 1, completed: 1 }, s])).toBe(s)
  })

  it('returns the most recent incomplete (list is created_at DESC)', () => {
    const recent = { id: 5, completed: 0 }
    const older = { id: 2, completed: 0 }
    expect(findActiveSession([{ id: 6, completed: 1 }, recent, older])).toBe(recent)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/activeSession.test.jsx`
Expected: FAIL — cannot resolve `./activeSession` / `findActiveSession is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/activeSession.jsx`:

```jsx
export function findActiveSession(sessions) {
  if (!Array.isArray(sessions)) return null
  return sessions.find(s => !s.completed) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/activeSession.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/activeSession.jsx frontend/src/lib/activeSession.test.jsx
git commit -m "feat(frontend): add findActiveSession selector"
```

---

### Task 2: `ActiveSessionProvider` + `useActiveSession`

**Files:**
- Modify: `frontend/src/lib/activeSession.jsx`
- Test: `frontend/src/lib/activeSession.provider.test.jsx`

**Interfaces:**
- Consumes: `findActiveSession` (Task 1); `api` from `../api`.
- Produces:
  - `ActiveSessionContext` — a React context whose value is `{ active, refresh, discard }`.
  - `ActiveSessionProvider({ children })` — fetches `GET /api/sessions` on mount, sets `active = findActiveSession(...)`.
  - `useActiveSession() -> { active, refresh, discard }` where `active` is `session | null`, `refresh() -> Promise<void>` re-fetches and recomputes, `discard(id) -> Promise<void>` calls `DELETE /sessions/:id` then `refresh()`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/activeSession.provider.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ActiveSessionProvider, useActiveSession } from './activeSession'

vi.mock('../api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))
import { api } from '../api'

function Probe() {
  const { active, discard } = useActiveSession()
  return (
    <div>
      <span data-testid="active">{active ? active.id : 'none'}</span>
      <button onClick={() => discard(active.id)}>discard</button>
    </div>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('ActiveSessionProvider', () => {
  it('exposes the incomplete session after mount', async () => {
    api.get.mockResolvedValue([{ id: 7, completed: 0 }])
    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
  })

  it('discard deletes then refreshes to no active', async () => {
    api.get.mockResolvedValueOnce([{ id: 7, completed: 0 }])
    api.delete.mockResolvedValue({ deleted: true })
    api.get.mockResolvedValueOnce([{ id: 7, completed: 1 }])
    render(<ActiveSessionProvider><Probe /></ActiveSessionProvider>)
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('7'))
    fireEvent.click(screen.getByText('discard'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/sessions/7'))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('none'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/activeSession.provider.test.jsx`
Expected: FAIL — `ActiveSessionProvider`/`useActiveSession` are not exported.

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/lib/activeSession.jsx` — keep `findActiveSession`, add the imports at the top and the provider/hook below:

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../api'

export function findActiveSession(sessions) {
  if (!Array.isArray(sessions)) return null
  return sessions.find(s => !s.completed) ?? null
}

export const ActiveSessionContext = createContext({
  active: null,
  refresh: async () => {},
  discard: async () => {},
})

export function ActiveSessionProvider({ children }) {
  const [active, setActive] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const sessions = await api.get('/sessions')
      setActive(findActiveSession(sessions))
    } catch {
      setActive(null)
    }
  }, [])

  const discard = useCallback(async (id) => {
    await api.delete(`/sessions/${id}`)
    await refresh()
  }, [refresh])

  useEffect(() => { refresh() }, [refresh])

  return (
    <ActiveSessionContext.Provider value={{ active, refresh, discard }}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  return useContext(ActiveSessionContext)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/activeSession.test.jsx src/lib/activeSession.provider.test.jsx`
Expected: PASS (selector 4 + provider 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/activeSession.jsx frontend/src/lib/activeSession.provider.test.jsx
git commit -m "feat(frontend): add ActiveSessionProvider context"
```

---

### Task 3: `ResumeBanner` component

**Files:**
- Create: `frontend/src/components/ResumeBanner.jsx`
- Test: `frontend/src/components/ResumeBanner.test.jsx`

**Interfaces:**
- Consumes: `useActiveSession` + `ActiveSessionContext` (Task 2); `PLAN`, `DAY_COLORS` from `../data/workoutPlan`; `useLocation`, `useNavigate` from `react-router-dom`.
- Produces: default-exported `ResumeBanner` React component. Renders `null` when `active` is null or pathname === `/workout/:activeId`. Otherwise a bar with: a `Resume ›` button (navigates to the session), and a discard control — an `×` button (`aria-label="discard session"`) that reveals an inline confirm (`Discard?` + `aria-label="confirm discard"` ✓ / `aria-label="cancel discard"` ✗); confirm calls `discard(active.id)`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ResumeBanner.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResumeBanner from './ResumeBanner'
import { ActiveSessionContext } from '../lib/activeSession'

function renderBanner(value, path = '/progress') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveSessionContext.Provider value={value}>
        <ResumeBanner />
      </ActiveSessionContext.Provider>
    </MemoryRouter>
  )
}

const activeVal = (over = {}) => ({
  active: { id: 9, workout_day: 'upper_a' },
  refresh: vi.fn(),
  discard: vi.fn(),
  ...over,
})

describe('ResumeBanner', () => {
  it('renders nothing when there is no active session', () => {
    const { container } = renderBanner({ active: null, refresh: vi.fn(), discard: vi.fn() })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the resume affordance when a session is active', () => {
    renderBanner(activeVal())
    expect(screen.getByText(/in progress/)).toBeInTheDocument()
    expect(screen.getByText('Resume ›')).toBeInTheDocument()
  })

  it("hides on the active session's own page", () => {
    const { container } = renderBanner(activeVal(), '/workout/9')
    expect(container).toBeEmptyDOMElement()
  })

  it('discard requires confirm then calls discard', () => {
    const discard = vi.fn()
    renderBanner(activeVal({ discard }))
    fireEvent.click(screen.getByRole('button', { name: 'discard session' }))
    expect(screen.getByText('Discard?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'confirm discard' }))
    expect(discard).toHaveBeenCalledWith(9)
  })

  it('cancel keeps the session', () => {
    const discard = vi.fn()
    renderBanner(activeVal({ discard }))
    fireEvent.click(screen.getByRole('button', { name: 'discard session' }))
    fireEvent.click(screen.getByRole('button', { name: 'cancel discard' }))
    expect(screen.queryByText('Discard?')).not.toBeInTheDocument()
    expect(discard).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ResumeBanner.test.jsx`
Expected: FAIL — cannot resolve `./ResumeBanner`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/ResumeBanner.jsx`:

```jsx
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useActiveSession } from '../lib/activeSession'
import { PLAN, DAY_COLORS } from '../data/workoutPlan'

export default function ResumeBanner() {
  const { active, discard } = useActiveSession()
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (!active) return null
  if (pathname === `/workout/${active.id}`) return null

  const plan = PLAN[active.workout_day]
  const color = DAY_COLORS[active.workout_day] || '#9ca3af'
  const label = plan ? `${plan.emoji} ${plan.name}` : 'Workout'

  return (
    <div style={{ background: '#111120', borderTop: '1px solid #1e1e32', borderBottom: '1px solid #1e1e32' }}>
      <div className="max-w-md mx-auto" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', gap: 12,
      }}>
        <button onClick={() => nav(`/workout/${active.id}`)} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>{label} in progress</span>
          <span style={{ color, fontSize: '0.8rem', fontWeight: 700, marginLeft: 'auto' }}>Resume ›</span>
        </button>
        {confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Discard?</span>
            <button aria-label="confirm discard" onClick={() => discard(active.id)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>✓</button>
            <button aria-label="cancel discard" onClick={() => setConfirming(false)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem' }}>✗</button>
          </div>
        ) : (
          <button aria-label="discard session" onClick={() => setConfirming(true)}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}>×</button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ResumeBanner.test.jsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ResumeBanner.jsx frontend/src/components/ResumeBanner.test.jsx
git commit -m "feat(frontend): add ResumeBanner component"
```

---

### Task 4: Wire provider + banner into the app shell

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/TopBar.jsx`

**Interfaces:**
- Consumes: `ActiveSessionProvider` (Task 2), `ResumeBanner` (Task 3).
- Produces: app shell where the provider wraps all routes, and a single sticky header stack holds `TopBar` then `ResumeBanner`. No new exports.

Rationale: `TopBar` currently owns `position: sticky`. Move stickiness up to a wrapper that contains both `TopBar` and `ResumeBanner`, so the banner sits flush under the bar without magic pixel offsets.

- [ ] **Step 1: Make `TopBar` a plain (non-sticky) bar**

In `frontend/src/components/TopBar.jsx`, change the outer wrapper `<div>` style — remove the sticky positioning, keep the background/border so it stays opaque:

```jsx
    <div style={{
      background: '#0a0a12', borderBottom: '1px solid #1e1e32'
    }}>
```

(Remove the `position: 'sticky', top: 0, zIndex: 45,` properties only.)

- [ ] **Step 2: Wrap routes in the provider and add the sticky header stack**

Replace the body of `frontend/src/App.jsx` with:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Workout from './pages/Workout'
import Exercise from './pages/Exercise'
import Progress from './pages/Progress'
import History from './pages/History'
import NavBar from './components/NavBar'
import TopBar from './components/TopBar'
import ResumeBanner from './components/ResumeBanner'
import { ActiveSessionProvider } from './lib/activeSession'

export default function App() {
  return (
    <BrowserRouter>
      <ActiveSessionProvider>
        <div style={{ background: '#0a0a12', minHeight: '100dvh' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 45 }}>
            <TopBar />
            <ResumeBanner />
          </div>
          <div className="max-w-md mx-auto pb-24 px-4">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/workout/:sessionId" element={<Workout />} />
              <Route path="/exercise/:workoutDay/:exerciseId" element={<Exercise />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/history" element={<History />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
          <NavBar />
        </div>
      </ActiveSessionProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Verify the full suite still passes and the app builds**

Run: `cd frontend && npm test && npm run build`
Expected: all test files PASS; `vite build` completes with no errors.

- [ ] **Step 4: Manual smoke (document result)**

Run `npm run dev`, then: Start a workout → navigate to History via the bottom nav → confirm the banner appears under the top bar with "… in progress / Resume ›". Tap Resume → returns to the session. Confirm the banner is hidden while on the workout page.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/TopBar.jsx
git commit -m "feat(frontend): mount resume banner in sticky header"
```

---

### Task 5: Home — Resume instead of Start when a session is active

**Files:**
- Modify: `frontend/src/pages/Home.jsx`
- Test: `frontend/src/pages/Home.test.jsx`

**Interfaces:**
- Consumes: `useActiveSession` (Task 2); `PLAN`, `DAY_COLORS`, `getNextWorkoutId` (existing).
- Produces: named export `StartOrResumeButton({ active, plan, color, starting, onStart, onResume })` — renders `Resume {plan.name}` (calls `onResume`) when `active` is truthy, else `Start {plan.name}` / `Starting…` (calls `onStart`, disabled while `starting`). Home renders its hero from the active session's plan when one exists, else the next-up plan; `startWorkout` calls `refresh()` after creating, before navigating.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/Home.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartOrResumeButton } from './Home'

describe('StartOrResumeButton', () => {
  it('renders Start and calls onStart when no active session', () => {
    const onStart = vi.fn()
    render(<StartOrResumeButton active={null} plan={{ name: 'Upper A' }} color="#fff"
      starting={false} onStart={onStart} onResume={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Start Upper A' })
    fireEvent.click(btn)
    expect(onStart).toHaveBeenCalled()
  })

  it('shows Starting… while starting', () => {
    render(<StartOrResumeButton active={null} plan={{ name: 'Upper A' }} color="#fff"
      starting={true} onStart={vi.fn()} onResume={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled()
  })

  it('renders Resume and calls onResume when a session is active', () => {
    const onResume = vi.fn()
    render(<StartOrResumeButton active={{ id: 9 }} plan={{ name: 'Upper A' }} color="#fff"
      starting={false} onStart={vi.fn()} onResume={onResume} />)
    const btn = screen.getByRole('button', { name: 'Resume Upper A' })
    fireEvent.click(btn)
    expect(onResume).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Home.test.jsx`
Expected: FAIL — `StartOrResumeButton` is not exported from `./Home`.

- [ ] **Step 3: Add the `StartOrResumeButton` export**

In `frontend/src/pages/Home.jsx`, add this named export (near the top of the file, after the imports):

```jsx
export function StartOrResumeButton({ active, plan, color, starting, onStart, onResume }) {
  if (active) {
    return (
      <button className="btn-primary" onClick={onResume}
        style={{ background: color, marginBottom: 32 }}>
        Resume {plan.name}
      </button>
    )
  }
  return (
    <button className="btn-primary" onClick={onStart} disabled={starting}
      style={{ background: color, marginBottom: 32 }}>
      {starting ? 'Starting…' : `Start ${plan.name}`}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/Home.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire Home to the active session**

In `frontend/src/pages/Home.jsx`:

5a. Import the hook — add to the existing imports:

```jsx
import { useActiveSession } from '../lib/activeSession'
```

5b. Inside `Home()`, after the existing `const nav = useNavigate()` line, add:

```jsx
  const { active, refresh } = useActiveSession()
```

5c. Replace the existing `nextId` / `next` / `color` derivation:

```jsx
  const nextId = getNextWorkoutId(sessions)
  const next = PLAN[nextId]
  const color = DAY_COLORS[nextId]
```

with a display plan that prefers the active session:

```jsx
  const nextId = getNextWorkoutId(sessions)
  const displayId = active ? active.workout_day : nextId
  const next = PLAN[displayId]
  const color = DAY_COLORS[displayId]
```

5d. In `startWorkout`, refresh the shared state after creating, before navigating — change:

```jsx
      const s = await api.post('/sessions', { workout_day: nextId })
      nav(`/workout/${s.id}`)
```

to:

```jsx
      const s = await api.post('/sessions', { workout_day: nextId })
      await refresh()
      nav(`/workout/${s.id}`)
```

5e. In the hero header, make the eyebrow label reflect progress — change:

```jsx
        <p style={{ color: '#6ee7b7', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          Next up
        </p>
```

to:

```jsx
        <p style={{ color: '#6ee7b7', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          {active ? 'In progress' : 'Next up'}
        </p>
```

5f. Replace the inline Start button:

```jsx
      <button className="btn-primary" onClick={startWorkout} disabled={starting}
        style={{ background: color, marginBottom: 32 }}>
        {starting ? 'Starting…' : `Start ${next.name}`}
      </button>
```

with the shared component:

```jsx
      <StartOrResumeButton
        active={active}
        plan={next}
        color={color}
        starting={starting}
        onStart={startWorkout}
        onResume={() => active && nav(`/workout/${active.id}`)}
      />
```

(The exercise-preview card already maps over `next.exercises`; because `next` now points at the active plan when one exists, it correctly previews the in-progress workout with no further change.)

- [ ] **Step 6: Verify suite + build**

Run: `cd frontend && npm test && npm run build`
Expected: all PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx
git commit -m "feat(frontend): Home resumes active session instead of starting a duplicate"
```

---

### Task 6: Workout — clear active state on finish

**Files:**
- Modify: `frontend/src/pages/Workout.jsx`

**Interfaces:**
- Consumes: `useActiveSession` (Task 2).
- Produces: after a successful finish (`PATCH /sessions/:id { completed: true }`), the shared active-session state is refreshed so the banner clears and Home reverts to Start. No new exports.

- [ ] **Step 1: Import the hook**

In `frontend/src/pages/Workout.jsx`, add to the imports:

```jsx
import { useActiveSession } from '../lib/activeSession'
```

- [ ] **Step 2: Read `refresh` from the hook**

Inside `Workout()`, after `const nav = useNavigate()`, add:

```jsx
  const { refresh } = useActiveSession()
```

- [ ] **Step 3: Refresh after a successful finish**

In `finishWorkout`, immediately after the successful patch line:

```jsx
      const updated = await api.patch(`/sessions/${sessionId}`, { completed: true })
```

add:

```jsx
      refresh()
```

- [ ] **Step 4: Verify suite + build**

Run: `cd frontend && npm test && npm run build`
Expected: all PASS; build succeeds.

- [ ] **Step 5: Manual end-to-end (document result)**

`npm run dev`: Start a workout → leave to Home (button shows **Resume Upper …**, eyebrow reads **In progress**, banner visible) → Resume → **Finish ✓** → on the summary tap **Done → Home**: banner is gone and Home shows **Start** again. Separately: Start → leave to History → banner **× → Discard? → ✓**: banner disappears and Home shows **Start** again.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Workout.jsx
git commit -m "feat(frontend): clear active-session banner when a workout is finished"
```

---

## Self-Review

**Spec coverage:**
- Global resume banner on every page → Tasks 3 + 4. ✓
- Hidden on the active session's own page → Task 3 (test + guard). ✓
- Tap to resume → Task 3 (banner) + Task 5 (Home button). ✓
- Resume, don't duplicate (Home Start→Resume) → Task 5. ✓
- Discard via banner `×` with inline confirm → Task 3. ✓
- Shared source of truth / `findActiveSession` / refresh at create-finish-discard → Tasks 1, 2 (create=Task 5, finish=Task 6, discard=Task 2). ✓
- No backend changes → confirmed; only `frontend/` files touched. ✓
- `workout_day` not in `PLAN` guard → Task 3 (`label`/`color` fallbacks); Home uses `DAY_COLORS[displayId]` which for a known active day is always defined. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `findActiveSession`, `useActiveSession` → `{ active, refresh, discard }`, `discard(id)`, `StartOrResumeButton({ active, plan, color, starting, onStart, onResume })`, and the `aria-label`s (`discard session` / `confirm discard` / `cancel discard`) are used identically across tasks and their tests. ✓
