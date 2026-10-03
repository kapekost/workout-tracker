# Motion System (#164) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app's one real modal (`ExerciseCuesModal`) a bottom-sheet enter/exit animation, and every screen-to-screen navigation a crossfade, both respecting the existing `prefers-reduced-motion` convention, with no new dependency.

**Architecture:** Two independent, unrelated pieces of the same Issue — a route-level crossfade wrapper in `App.jsx`, and a 3-phase (`entering` → `open` → `closing`) state machine inside `ExerciseCuesModal.jsx` that defers its `onClose` callback until its exit transition finishes. Both use plain CSS transitions/animations driven by inline styles or a small CSS class, matching this codebase's existing patterns exactly (see "Precedents" below) — no animation library, no new dependency.

**Tech Stack:** React 19, react-router-dom v7 (declarative `<BrowserRouter>` mode), Vite, Vitest + Testing Library, plain CSS (no CSS-in-JS, no Tailwind).

**Spec:** `docs/superpowers/specs/2026-09-14-visual-polish-design.md`, Section 3 ("Motion system"). This plan resolves the one decision that spec explicitly left open (route-transition implementation) — see "Decision: crossfade mechanism" below.

## Global Constraints

- No new npm dependency, no new build config (per the spec's "efficient, not overengineered" constraint, `DECISIONS.md` 2026-09-06).
- All new motion must be added to the **existing** `@media (prefers-reduced-motion: reduce)` block in `frontend/src/index.css` — never a second, parallel reduced-motion block.
- `ExerciseCuesModal`'s public props/contract (`ex`, `color`, `onClose`) do not change — only *when* `onClose` fires changes (after the exit animation, not immediately). No caller (`Workout.jsx`) needs to change.
- Centered-dialog / confirm-modal patterns are explicitly **out of scope** — the spec dropped that pattern after finding destructive actions use an existing tap-again-to-confirm button pattern instead, not a modal. Do not add one.
- Full frontend suite (`cd frontend && npm test`) must pass after each task — currently 397 tests, 44 files.

## Decision: route-transition mechanism (resolving the spec's open question)

The spec left two options open: the native View Transitions API, or a manual CSS-transition wrapper keyed on `location.pathname`.

**Verified before choosing, not assumed:** react-router-dom's `viewTransition` integration (the `viewTransition` prop on `Link`/`useNavigate`) requires **Data mode** (`createBrowserRouter` + `RouterProvider`) or Framework mode — it is explicitly **not available** in Declarative mode, which is what this app uses (`<BrowserRouter>` in `App.jsx` wrapping plain `<Routes>`/`<Route>` children). Migrating the whole app to the data-router API just to get this one feature would be a large, unrelated routing refactor — far outside a motion-polish Issue. Calling `document.startViewTransition()` manually, without that integration, requires wrapping the state update in `flushSync` to synchronize with the API's synchronous DOM-snapshot timing — fragile to bolt onto a plain `<Routes>` tree, and this app's pages have real side effects on mount (`Workout.jsx`'s rest timer, `TimerBar`'s wake-lock, active-session polling) that make briefly double-mounting two page trees (which a *true* overlapping crossfade would require) a real risk, not just extra code.

**Decision: manual CSS-transition wrapper, single-mount fade-in-on-navigate** (not a literal overlapping dual-render crossfade). Key a wrapping `<div>` around the routed content by `location.pathname`; changing `key` forces React to unmount the old wrapper and mount a genuinely new DOM node, which naturally (re-)plays a CSS `@keyframes` animation on that new node — no JS timing code needed at all. This reads as "the new screen fades in" rather than a literal two-screen crossfade, which satisfies the spec's intent (smooth transition, not an abrupt cut) without the mount-safety risk above.

## Precedents this plan follows (read before starting)

- `frontend/src/index.css`'s `.toast` class already does exactly this pattern: `animation: slideDown 0.3s ease;` on a class, and the *existing* `@media (prefers-reduced-motion: reduce)` block already lists `.toast` in `{ animation: none; }`. The new `.route-fade` class follows the identical shape.
- `frontend/src/components/MuscleGroupPicker.jsx:66` sets `transition` via **inline style** (`style={{ transition: 'stroke-dashoffset 600ms ease-out, stroke 600ms ease-out' }}`), and the existing reduced-motion block overrides it with `.recovery-ring circle { transition: none !important; }` — `!important` in an external stylesheet *does* beat an inline style. `ExerciseCuesModal`'s new transition follows this identical shape: inline `transition`/`transform`/`opacity` styles, overridden by a new `!important` rule in the same media block.
- `window.matchMedia?.('(prefers-reduced-motion: reduce)').matches` is already used in `TimerBar.jsx:36`, `ExerciseDetails.jsx:21`, and `Workout.jsx:340` for JS-side (not just CSS-side) reduced-motion checks. Reuse this exact expression for the modal's deferred-close timing (see Task 2). jsdom's built-in `matchMedia` returns `{ matches: false }` by default with no setup needed — this is why those existing call sites have no test-side mocking, and this plan's tests need none either.
- `vi.useFakeTimers()` / `act(() => vi.advanceTimersByTime(ms))` / `vi.useRealTimers()` is the established pattern for testing `setTimeout`-driven behavior in this codebase — see `frontend/src/pages/Workout.test.jsx:219-231` and `:327-331`. Task 2's tests use this exact pattern, not a new one.
- `frontend/src/App.test.jsx:133-142` ("still navigates between screens") is the reference shape for rendering the real `<App/>`, clicking a nav button, and asserting on the resulting screen — Task 1's test extends this file, not a new one.

---

### Task 1: Route crossfade

**Files:**
- Modify: `frontend/src/App.jsx` (the `Shell` component, ~line 109)
- Modify: `frontend/src/index.css` (new `.route-fade` class + keyframes, and the existing reduced-motion block)
- Modify: `frontend/src/App.test.jsx` (one new test)

**Interfaces:**
- Consumes: `useLocation()` from `react-router-dom` (already imported in `App.jsx` for `RedirectToLogin`), `.page-shell` (existing class, unchanged).
- Produces: nothing other tasks depend on — this task is self-contained.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/App.test.jsx`, inside the existing `describe` block that contains "still navigates between screens" (so it shares that block's `authenticated()`/`render(<App />)` setup):

```jsx
it('wraps routed content in a keyed fade wrapper that changes per screen', async () => {
  authenticated()
  render(<App />)
  await screen.findByText(/Next up/i)

  const homeWrapper = document.querySelector('.route-fade')
  expect(homeWrapper).toBeInTheDocument()
  const homeWrapperNode = homeWrapper

  fireEvent.click(screen.getByRole('button', { name: /History/i }))
  await screen.findByRole('heading', { name: 'History' })

  const historyWrapper = document.querySelector('.route-fade')
  expect(historyWrapper).toBeInTheDocument()
  // A new DOM node, not the same one re-used -- this is what actually
  // retriggers the CSS animation on navigation.
  expect(historyWrapper).not.toBe(homeWrapperNode)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.jsx -t "route-fade"`
Expected: FAIL — `document.querySelector('.route-fade')` returns `null` (class doesn't exist yet).

- [ ] **Step 3: Add the CSS**

In `frontend/src/index.css`, near the other `@keyframes` (after `.toast`'s `slideDown`, ~line 190):

```css
.route-fade { animation: routeFadeIn 200ms ease; }
@keyframes routeFadeIn { from { opacity: 0; } to { opacity: 1; } }
```

Add `.route-fade` to the existing reduced-motion block's `animation: none` list (do not create a second block):

```css
@media (prefers-reduced-motion: reduce) {
  .timer-bar.flash, .toast, .skeleton, .route-fade { animation: none; }
  .recovery-ring circle { transition: none !important; }
}
```

- [ ] **Step 4: Wrap the routed content in `App.jsx`**

In the `Shell` component, `App.jsx` currently has (~line 65-71 and ~109):

```jsx
function Shell() {
  const { ready, profile } = useSession()
  ...
```

Add `useLocation` to the existing `react-router-dom` import (it's already imported for `RedirectToLogin`, just add it to `Shell`'s own destructuring by calling the hook again — `useLocation()` is safe to call from multiple components under one `<BrowserRouter>`):

```jsx
function Shell() {
  const { ready, profile } = useSession()
  const location = useLocation()
  ...
```

Change the routed-content line (currently `{profile ? <AppRoutes /> : <PublicRoutes />}`) to:

```jsx
<div key={location.pathname} className="route-fade">
  {profile ? <AppRoutes /> : <PublicRoutes />}
</div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.jsx`
Expected: PASS — all tests in the file, not just the new one (confirms the extra wrapper `<div>` doesn't break any existing semantic-query-based test).

- [ ] **Step 6: Run the full suite**

Run: `cd frontend && npm test`
Expected: 397 existing tests + 1 new = 398 passing, 44 files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx frontend/src/index.css
git commit -m "feat(motion): crossfade on screen-to-screen navigation"
```

---

### Task 2: `ExerciseCuesModal` enter/exit animation

**Files:**
- Modify: `frontend/src/components/ExerciseCuesModal.jsx`
- Modify: `frontend/src/components/ExerciseCuesModal.test.jsx` (4 existing tests need updating, 2 new tests added)
- Modify: `frontend/src/index.css` (reduced-motion block only — no new class needed for the *shapes*, since styles stay inline per the precedent above, but the elements need class names for the media query to target them)

**Interfaces:**
- Consumes: nothing new.
- Produces: `onClose` prop still fires exactly once, just later than today (after the exit transition) — `Workout.jsx`'s existing `onClose={() => setCuesEx(null)}` wiring needs no change and is not part of this task's file list.

**Current behavior (read `ExerciseCuesModal.jsx` in full before starting):** the component has no animation. `onClose` fires synchronously and immediately from three places: the Escape key handler (`useEffect`'s `onKey`), the backdrop's `onClick`, and the close button's `onClick`.

**New behavior:** a `phase` state machine — `'entering'` (initial render, sheet offscreen/backdrop transparent) → `'open'` (after a brief `setTimeout(0)` lets the browser paint the entering state first, so the transition to `'open'` actually animates) → `'closing'` (on any close request; sheet/backdrop animate back to the entering-state values) → after `MODAL_EXIT_MS`, the real `onClose` prop fires (or immediately, if `prefers-reduced-motion` is set).

- [ ] **Step 1: Write the failing tests**

Replace `ExerciseCuesModal.test.jsx`'s four "calls onClose" tests (the ones for Escape, backdrop click, and the close button — leave "renders as a labeled dialog" and "clicking inside the sheet does not call onClose" untouched, they don't involve closing) with fake-timer versions, and add two new tests for the phase transitions themselves:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
// (add afterEach to the existing vitest import, and act to the existing
// @testing-library/react import — this file currently imports only
// render/screen/fireEvent from it)

const MODAL_EXIT_MS = 250 // must match the constant in ExerciseCuesModal.jsx

afterEach(() => { vi.useRealTimers() })

// Fake timers never auto-advance: right after render(), `phase` is still
// 'entering' (the mount's setTimeout(fn, 0) that flips it to 'open' hasn't
// fired yet), and requestClose()'s guard ignores close requests until
// phase === 'open'. Every test below must advance past that first before
// simulating a close — otherwise the guard silently swallows the close
// request and the test would pass for the wrong reason (or fail confusingly
// with onClose never called even after advancing MODAL_EXIT_MS).
function renderOpen(onClose) {
  render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
  act(() => { vi.advanceTimersByTime(0) })
}

it('Escape defers onClose until the exit animation finishes', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  renderOpen(onClose)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('clicking the backdrop defers onClose the same way', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  renderOpen(onClose)
  fireEvent.click(screen.getByRole('dialog'))
  expect(onClose).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('the close button defers onClose the same way', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  renderOpen(onClose)
  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  expect(onClose).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('a second close request while already closing does not schedule a second onClose call', () => {
  vi.useFakeTimers()
  const onClose = vi.fn()
  renderOpen(onClose)
  fireEvent.keyDown(document, { key: 'Escape' })
  fireEvent.keyDown(document, { key: 'Escape' }) // repeated while closing
  act(() => { vi.advanceTimersByTime(MODAL_EXIT_MS) })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('reduced motion closes immediately, with no animation delay', () => {
  vi.useFakeTimers()
  const original = window.matchMedia
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  const onClose = vi.fn()
  renderOpen(onClose)
  fireEvent.click(screen.getByRole('button', { name: 'close' }))
  act(() => { vi.advanceTimersByTime(0) }) // the reduced-motion exit still goes through setTimeout(fn, 0), not a synchronous call
  expect(onClose).toHaveBeenCalledTimes(1)
  window.matchMedia = original
})
```

Two more edge cases to verify while implementing, not just the six above: **clicking inside the sheet** (the existing, untouched test) must still not call `requestClose` at all — confirm `e.stopPropagation()` on the sheet's own `onClick` is still in place, since the backdrop's `onClick={requestClose}` now fires on *any* unstopped click, not just ones that reach the dialog's own root. And **"renders as a labeled dialog"** (also untouched) renders synchronously with real timers (no `vi.useFakeTimers()` in that test) — confirm it still passes as-is, since that test asserts on attributes present from the very first render (phase `'entering'`), not on anything that depends on reaching `'open'`.

(`fireEvent.click(screen.getByText('Bench Press'))` for "clicking inside the sheet does not call onClose" needs no timer changes — it never triggers a close request at all, so it stays exactly as it is today.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ExerciseCuesModal.test.jsx`
Expected: FAIL — `onClose` is still called synchronously today, so `expect(onClose).not.toHaveBeenCalled()` (checked before advancing timers) fails.

- [ ] **Step 3: Implement the phase state machine**

Rewrite `ExerciseCuesModal.jsx`'s body (the export is unchanged — same props):

```jsx
import { useEffect, useState, useRef } from 'react'
import ExerciseDetails from './ExerciseDetails'
import { colors, type } from '../lib/theme'

const MODAL_EXIT_MS = 250

export default function ExerciseCuesModal({ ex, color, onClose }) {
  const [phase, setPhase] = useState('entering') // 'entering' | 'open' | 'closing'
  const exitTimer = useRef(null)

  useEffect(() => {
    const id = setTimeout(() => setPhase('open'), 0)
    return () => clearTimeout(id)
  }, [])

  function requestClose() {
    if (phase !== 'open') return // already closing (or never finished entering) -- ignore repeats
    setPhase('closing')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    exitTimer.current = setTimeout(onClose, reduced ? 0 : MODAL_EXIT_MS)
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => () => clearTimeout(exitTimer.current), [])

  const visible = phase === 'open'

  return (
    <div role="dialog" aria-modal="true" aria-label={`${ex.name} form cues`}
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        opacity: visible ? 1 : 0, transition: 'opacity 250ms ease',
      }}
      className="cues-overlay">
      <div onClick={e => e.stopPropagation()}
        className="cues-sheet"
        style={{
          background: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          width: '100%', maxWidth: 'var(--content-max-width)', margin: '0 auto', maxHeight: '85vh', overflowY: 'auto',
          padding: '20px 16px calc(24px + env(safe-area-inset-bottom))',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 250ms cubic-bezier(.32,.72,0,1)',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: type.weight.bold }}>{ex.name}</h2>
          <button className="btn-icon tap-target" aria-label="close" onClick={requestClose}>×</button>
        </div>
        {ex.alt && <p style={{ color: colors.muted2, fontSize: type.size.md, marginBottom: 16 }}>{ex.alt}</p>}

        <ExerciseDetails ex={ex} color={color} />
      </div>
    </div>
  )
}
```

Note the `onKey` effect now depends on `phase` (via the closure over `requestClose`, which reads `phase`) — re-registering the listener on every phase change is cheap (one `document` listener) and guarantees `requestClose`'s guard sees the current phase rather than a stale one from the initial render's closure. This is the same re-subscribe-on-dependency-change shape already used elsewhere in this file (the effect existed before this change, just with an empty-ish dependency list previously — now it needs `[phase]` since the handler's behavior depends on it).

- [ ] **Step 4: Add the reduced-motion CSS**

In the existing `@media (prefers-reduced-motion: reduce)` block in `index.css`, add a line (do not create a new block):

```css
.cues-overlay, .cues-sheet { transition: none !important; }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ExerciseCuesModal.test.jsx`
Expected: PASS, all tests including the untouched "renders as a labeled dialog" and "clicking inside the sheet" ones.

- [ ] **Step 6: Run the full suite**

Run: `cd frontend && npm test`
Expected: all tests pass (397 + 1 from Task 1 + 6 new/changed here — check the final count lands where expected, don't just eyeball "no failures").

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ExerciseCuesModal.jsx frontend/src/components/ExerciseCuesModal.test.jsx frontend/src/index.css
git commit -m "feat(motion): bottom-sheet enter/exit animation for ExerciseCuesModal"
```

---

## Verification (easy to skip, don't)

- [ ] **Render both in an actual browser**, not just jsdom — jsdom does not run real CSS transitions/animations, so the test suite passing only confirms the *mechanism* (classes, timing, deferred callback), never the *visual result*. Start the app locally (`AGENTS.md`'s "Running the whole app locally" section has the exact commands and the no-Resend password-seeding snippet), then:
  - Navigate between two screens (e.g. Home → History) and confirm the new screen visibly fades in, not an abrupt cut.
  - Open an exercise's "Form cues + demo" bottom sheet from the active workout screen, and confirm it slides up smoothly; close it (via ×, Escape, and tapping the backdrop — all three) and confirm it slides back down before disappearing, not vanishing then a pause then nothing.
  - In macOS System Settings → Accessibility → Display → "Reduce motion" (or the equivalent OS/browser reduced-motion toggle), confirm both the route change and the modal open/close become instant with no animation.
- [ ] **UI-expert and UX-expert review, as two separate passes** (the standing gate refined 2026-09-14, `PLAYBOOK.md` step 5) — against real screenshots/a recording of the above, not a description of it. This is not optional for a UI-touching change.
- [ ] Confirm the final `npm test` count and file count match what step 6 of each task predicted — a silently-skipped test file is a common way a real regression hides.
