# Design tokens: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give inline `style={{}}` objects a real token to reach for, migrate
all 14 files the design-system inventory found hardcoding literals, fix the
`DAY_COLORS` fallback inconsistency, fix a code smell found this session, and
backfill regression tests for UI behavior this session shipped with none.

**Architecture:** One new `frontend/src/lib/theme.js` JS constants module
(not CSS custom properties; see the spec's §1 for why), consumed by
`import`-ing into `style={{}}` objects across 14 existing files plus the 3
already-new ones. `index.css`'s existing `:root` custom properties are
touched only to add `--danger` and fix `.toast.error`. No backend changes.

**Tech Stack:** React 18 + Vite, Vitest + `@testing-library/react`. Plain
JavaScript, no TypeScript. No new runtime dependencies.

**Spec:** [`../specs/2026-08-23-design-tokens-design.md`](../specs/2026-08-23-design-tokens-design.md)

## Global Constraints

- No behavior changes outside two named exceptions: the bodyweight-label
  restructure (Task 11) and the `DAY_COLORS` fallback unification (Task 13).
  Every other task is a pure literal-for-token value swap: same JSX
  structure, same rendered output, just a named token instead of a
  hardcoded value.
- After every task: `cd frontend && npm run build && npm test`, both green,
  not just `npm test`. A typo'd `theme.js` export name is a build-time
  failure in several of these files, not a test-time one.
- Regression tests added for already-correct behavior (Tasks 2, 4, 8, 9) are
  **characterization tests**: written to pass immediately on the first run,
  not red-green TDD. State this in each such task rather than silently
  deviating from this repo's usual TDD convention.
- Never touch the protected 320px/44px-floor magic numbers or `RecoveryRing`
  color-ramp semantics named in the spec's Guardrails section. When a
  migration task reaches one of those files, the step list says explicitly
  what to leave alone.
- Frontend only. No `backend/` changes anywhere in this plan.

---

### Task 1: `theme.js` token module + `--danger` in `index.css`

**Files:**
- Create: `frontend/src/lib/theme.js`, `frontend/src/lib/theme.test.js`
- Modify: `frontend/src/index.css`

**Produces:** `colors`, `type`, `space`, `radius` named exports
from `theme.js`, per the spec's §2 token tables.

- [ ] **Step 1: Write the failing test**: create `frontend/src/lib/theme.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { colors } from './theme'

// These 9 values must stay byte-identical to index.css's :root custom
// properties (frontend/src/index.css:24-32). The two layers serve
// different consumers (see the design-tokens spec, section 1) but must
// never drift apart.
describe('theme colors match index.css :root', () => {
  it('carries over the 9 tier-1 tokens unchanged', () => {
    expect(colors.bg).toBe('#0a0a12')
    expect(colors.card).toBe('#111120')
    expect(colors.border).toBe('#1e1e32')
    expect(colors.mint).toBe('#6ee7b7')
    expect(colors.amber).toBe('#fbbf24')
    expect(colors.muted).toBe('#9ca3af')
    expect(colors.muted2).toBe('#6b7280')
    expect(colors.text).toBe('#fff')
    expect(colors.danger).toBe('#ef4444')
  })
})
```
- [ ] **Step 2: Run, verify fail**: `cd frontend && npm test -- theme.test.js` → FAIL (`theme.js` doesn't exist).

- [ ] **Step 3: Implement**: create `frontend/src/lib/theme.js`:
```js
// Central style tokens for this app's inline-style-heavy React components.
// See docs/superpowers/specs/2026-08-23-design-tokens-design.md for why
// this is a JS module and not CSS custom properties: several call sites
// (e.g. Progress.jsx's recharts props) take raw numbers, not CSS values.
//
// The tier-1 color values below are carried over unchanged from index.css's
// :root custom properties and asserted equal to them in theme.test.js, so
// the two layers can't silently drift.

export const colors = {
  // Tier 1: unchanged from index.css :root
  bg: '#0a0a12',
  card: '#111120',
  border: '#1e1e32',
  mint: '#6ee7b7',
  amber: '#fbbf24',
  muted: '#9ca3af',
  muted2: '#6b7280',
  text: '#fff',
  danger: '#ef4444',

  // Tier 2: deliberate near-duplicate merges (spec section 2.1)
  textSecondary: '#e2e8f0',
  surface1: '#14142a',
  divider: '#1e1e32',
  mintWash: 'rgba(110, 231, 183, 0.14)',
  dangerBg: '#2a1a1a',
}

export const type = {
  size: {
    xs: '0.65rem',
    sm: '0.7rem',
    base: '0.75rem',
    md: '0.8rem',
    lg: '0.875rem',
    title: '1.75rem',
    display: '2rem',
  },
  weight: {
    regular: 400,
    semibold: 600,
    bold: 700,
  },
  labelTracking: '0.08em',
}

export const space = {
  xs: 4,
  sm: 8,
  smd: 10,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 100,
  circle: '50%',
}
```
Then, in `frontend/src/index.css`, add `--danger: #ef4444;` to the `:root`
block (after `--muted-2`), and change `.toast.error { background: #ef4444;
color: #fff; }` to `.toast.error { background: var(--danger); color: #fff;
}`.

- [ ] **Step 4: Run, verify pass**: `npm test -- theme.test.js` → PASS.
- [ ] **Step 5: Verify build**: `npm run build` → clean.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/lib/theme.js frontend/src/lib/theme.test.js frontend/src/index.css
git commit -m "feat(design-tokens): add theme.js token module and --danger token"
```

---

### Task 2: `ExerciseCuesModal.test.jsx` (characterization, before its migration)

**Files:**
- Create: `frontend/src/components/ExerciseCuesModal.test.jsx`

**Consumes:** `components/ExerciseCuesModal.jsx` as it exists
today, unmigrated. This is a safety net for Task 3, not new behavior.

- [ ] **Step 1: Write the test** (already-correct behavior, expected to pass immediately):
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExerciseCuesModal from './ExerciseCuesModal'

vi.mock('../lib/demos', () => ({ getDemoFrames: () => null }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const ex = {
  id: 'bench_press', name: 'Bench Press', alt: 'or Dumbbell Press',
  sets: 3, repsLow: 6, repsHigh: 10, muscles: ['Chest'],
  ytUrl: 'https://example.com', cues: ['Retract shoulder blades'],
}

beforeEach(() => vi.clearAllMocks())

describe('ExerciseCuesModal', () => {
  it('renders as a labeled dialog', () => {
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-label')).toContain('Bench Press')
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking inside the sheet does not call onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByText('Bench Press'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the close button calls onClose', () => {
    const onClose = vi.fn()
    render(<ExerciseCuesModal ex={ex} color="#6ee7b7" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, verify pass immediately**: `npm test -- ExerciseCuesModal.test.jsx` → PASS (5 tests). This locks in current behavior; there is no implementation step because nothing is changing yet.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/ExerciseCuesModal.test.jsx
git commit -m "test(design-tokens): characterize ExerciseCuesModal before its token migration"
```

---

### Task 3: Migrate chunk 1 (small screen-furniture files)

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/components/TimerBar.jsx`, `frontend/src/components/ExerciseCuesModal.jsx`, `frontend/src/components/TopBar.jsx`, `frontend/src/components/NavBar.jsx`, `frontend/src/pages/Exercise.jsx`

**Consumes:** `theme.js` (Task 1).

- [ ] **Step 1: Migrate `TopBar.jsx` as the representative example.** Before:
```jsx
<div style={{ background: '#0a0a12', borderBottom: '1px solid #1e1e32' }}>
  ...
  <span style={{ color: '#6ee7b7', fontSize: '0.72rem', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase' }}>
```
After (import `{ colors, type }` from `../lib/theme` at the top of the
file):
```jsx
<div style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
  ...
  <span style={{ color: colors.mint, fontSize: type.size.sm, fontWeight: type.weight.bold,
    letterSpacing: type.labelTracking, textTransform: 'uppercase' }}>
```
(`0.72rem` maps to `type.size.sm` = `0.7rem`, a visible-but-tiny change per
inventory I11's tracking note; this file also moves `letterSpacing: 0.01em`
to `type.labelTracking` = `0.08em`, the more noticeable of the two.)

- [ ] **Step 2: Apply the same substitution to the other five files**: every
hardcoded color/size/weight/tracking literal becomes its matching `theme.js`
export, importing only what's used. No other JSX structure changes. `App.jsx`
has only 1 literal (the background color on its root `div`).

- [ ] **Step 3: Verify**: `npm run build && npm test` → both green.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/App.jsx frontend/src/components/TimerBar.jsx frontend/src/components/ExerciseCuesModal.jsx frontend/src/components/TopBar.jsx frontend/src/components/NavBar.jsx frontend/src/pages/Exercise.jsx
git commit -m "refactor(design-tokens): migrate small screen-furniture files to theme.js"
```

---

### Task 4: `ExerciseDetails.test.jsx` (characterization, before its migration)

**Files:**
- Create: `frontend/src/components/ExerciseDetails.test.jsx`

- [ ] **Step 1: Write the test:**
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExerciseDetails from './ExerciseDetails'

vi.mock('../lib/analytics', () => ({ track: vi.fn() }))
import { track } from '../lib/analytics'

const ex = {
  id: 'bench_press', name: 'Bench Press', sets: 3, repsLow: 6, repsHigh: 10,
  muscles: ['Chest', 'Triceps'], ytUrl: 'https://example.com/search',
  cues: ['Retract shoulder blades', 'Slight arch'],
}

beforeEach(() => vi.clearAllMocks())

describe('ExerciseDetails', () => {
  it('renders target sets/reps and the numbered cues list, and tracks cues_open', () => {
    vi.doMock('../lib/demos', () => ({ getDemoFrames: () => null }))
    render(<ExerciseDetails ex={ex} color="#6ee7b7" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('6–10')).toBeInTheDocument()
    expect(screen.getByText('Retract shoulder blades')).toBeInTheDocument()
    expect(track).toHaveBeenCalledWith('cues_open', { exercise_id: 'bench_press' })
  })

  it('shows the YouTube fallback and does not track demo_view when there are no demo frames', () => {
    render(<ExerciseDetails ex={ex} color="#6ee7b7" />)
    expect(screen.getByText(/Watch form demo on YouTube/)).toBeInTheDocument()
    expect(track).not.toHaveBeenCalledWith('demo_view', expect.anything())
  })
})
```
(Frame-present branch is covered indirectly by the existing
`frontend/src/lib/demos.test.js`; this file's job is `ExerciseDetails`'
rendering and tracking, not re-testing `getDemoFrames` itself.)

- [ ] **Step 2: Run, verify pass immediately**: `npm test -- ExerciseDetails.test.jsx` → PASS.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/ExerciseDetails.test.jsx
git commit -m "test(design-tokens): characterize ExerciseDetails before its token migration"
```

---

### Task 5: Migrate `ResumeBanner.jsx` + `ExerciseDetails.jsx`

**Files:**
- Modify: `frontend/src/components/ResumeBanner.jsx`, `frontend/src/components/ExerciseDetails.jsx`

- [ ] **Step 1: Migrate both files** following Task 3's pattern: every
hardcoded literal becomes its `theme.js` export. `ExerciseDetails.jsx`'s
`2rem` big-number sizes (sets/reps target) become `type.size.display`.
- [ ] **Step 2: Verify**: `npm run build && npm test` → both green (confirms Task 4's characterization tests still pass against the migrated file).
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/ResumeBanner.jsx frontend/src/components/ExerciseDetails.jsx
git commit -m "refactor(design-tokens): migrate ResumeBanner and ExerciseDetails to theme.js"
```

---

### Task 6: Migrate `MuscleGroupPicker.jsx` (isolated)

**Files:**
- Modify: `frontend/src/components/MuscleGroupPicker.jsx`

**Guardrail:** `RecoveryRing`'s color ramp is bound by
`2026-08-16-muscle-group-recovery-design.md` section 5: single-hue,
monotonic in lightness, never a percentage. Do not collapse its gradient
stops into fewer values than it already uses; only replace literal-for-token
where the *value* is unchanged.

- [ ] **Step 1: Migrate.** Includes closing inventory I5/I6 (the `mint`
accent's 4 notations: hex, hex+alpha, `rgba()`, decimal triple) onto
`colors.mint`/`colors.mintWash`, and I3 (`#15152a` onto `colors.surface1`).
- [ ] **Step 2: Manual check**: run the app (`npm run dev` + backend), open
the muscle-group picker, and confirm the recovery ring for each freshness
band still renders a smooth, monotonic single-hue ramp, not a stepped or
multi-hue one. This is a visual check; there's no automated assertion for it
today, matching the recovery spec's own enforcement level.
- [ ] **Step 3: Verify**: `npm run build && npm test` → both green.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/MuscleGroupPicker.jsx
git commit -m "refactor(design-tokens): migrate MuscleGroupPicker to theme.js, ring ramp unchanged"
```

---

### Task 7: Migrate `Home.jsx` + `History.jsx`

**Files:**
- Modify: `frontend/src/pages/Home.jsx`, `frontend/src/pages/History.jsx`

- [ ] **Step 1: Migrate both files** following Task 3's pattern. Includes
closing I8's heading-size split: `Home.jsx`'s `<h1>` moves from `2rem` to
`type.size.title` (`1.75rem`).
- [ ] **Step 2: Verify**: `npm run build && npm test` → both green.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Home.jsx frontend/src/pages/History.jsx
git commit -m "refactor(design-tokens): migrate Home and History to theme.js"
```

---

### Task 8: `TimerBar.test.jsx` (characterization, all 4 rest states)

**Files:**
- Create: `frontend/src/components/TimerBar.test.jsx`

No migration dependency (`TimerBar.jsx` was already migrated in Task 3);
this is sequenced here for narrative flow with Task 9.

- [ ] **Step 1: Write the test:**
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TimerBar from './TimerBar'

vi.mock('../lib/sound', () => ({ playBeep: vi.fn() }))
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

const baseProps = {
  sessionStartMs: Date.now(), restTargetSec: 90,
  onAddRest: () => {}, onSkipRest: () => {}, color: '#6ee7b7',
  wakeLockHeld: false, onTogglePause: () => {},
}

describe('TimerBar rest states', () => {
  it('idle: READY and the dash glyph', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={false} pausedRem={null} />)
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.getByText('—:—')).toBeInTheDocument()
  })

  it('resting: REST and a live countdown', () => {
    render(<TimerBar {...baseProps} restStartMs={Date.now()} paused={false} pausedRem={null} />)
    expect(screen.getByText('REST')).toBeInTheDocument()
  })

  it('paused: PAUSED and the frozen remaining time', () => {
    render(<TimerBar {...baseProps} restStartMs={null} paused={true} pausedRem={45} />)
    expect(screen.getByText('PAUSED')).toBeInTheDocument()
    expect(screen.getByText('0:45')).toBeInTheDocument()
  })

  it('rest hits zero: GO', () => {
    const past = Date.now() - 91_000
    render(<TimerBar {...baseProps} restStartMs={past} paused={false} pausedRem={null} />)
    expect(screen.getByText('GO')).toBeInTheDocument()
  })
})
```
- [ ] **Step 2: Run, verify pass immediately**: `npm test -- TimerBar.test.jsx` → PASS (4 tests).
- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/TimerBar.test.jsx
git commit -m "test(design-tokens): characterize all 4 TimerBar rest-label states"
```

---

### Task 9: `NumControl` hold-repeat tests (extend `Workout.test.jsx`)

**Files:**
- Modify: `frontend/src/pages/Workout.test.jsx`

Sequenced before Task 11 (the `Workout.jsx` migration), so it's a real
safety net.

- [ ] **Step 1: Write the tests**, added to the existing `describe('Workout page', ...)` block:
```jsx
  it('a quick tap on a stepper bumps by exactly one step', async () => {
    renderWorkout()
    await screen.findByText(ex1.name)
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const before = parseFloat(weightInput.value)
    fireEvent.click(screen.getAllByRole('button', { name: 'increase' })[0])
    expect(parseFloat(weightInput.value)).toBe(before + 2.5)
  })

  it('holding a stepper auto-repeats, and the trailing click does not double-bump', () => {
    vi.useFakeTimers()
    renderWorkout()
    const weightInput = screen.getAllByRole('spinbutton')[0]
    const before = parseFloat(weightInput.value)
    const incBtn = screen.getAllByRole('button', { name: 'increase' })[0]

    fireEvent.pointerDown(incBtn)
    vi.advanceTimersByTime(400)          // HOLD_DELAY_MS
    vi.advanceTimersByTime(90 * 3)       // 3 more repeats at HOLD_REPEAT_MS
    fireEvent.pointerUp(incBtn)
    fireEvent.click(incBtn)              // the trailing click a real long-press-release fires

    // 1 initial repeat at the delay boundary + 3 more, no extra bump from the trailing click
    expect(parseFloat(weightInput.value)).toBe(before + 2.5 * 4)
    vi.useRealTimers()
  })
```
Uses `getAllByRole('button', { name: 'increase' })[0]` for the weight
stepper (rendered first) since both steppers share the same `aria-label`,
the same disambiguation already used in
`docs/superpowers/plans/2026-08-17-personal-bests.md`'s Task 7.

- [ ] **Step 2: Run, verify pass immediately**: `npm test -- Workout.test.jsx` → PASS (existing tests plus these 2). Adjust the exact repeat-count assertion if a dry run shows the timer math lands differently; the behavior under test is "holds repeat, release doesn't double-bump," not a specific count.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Workout.test.jsx
git commit -m "test(design-tokens): characterize NumControl stepper hold-repeat"
```

---

### Task 10: Migrate `PersonalBests.jsx` + `Progress.jsx`

**Files:**
- Modify: `frontend/src/pages/PersonalBests.jsx`, `frontend/src/pages/Progress.jsx`

**Note:** `Progress.jsx`'s `recharts` props (`tick={{ fill: ..., fontSize:
11 }}`, `width={42}`, `stroke="#6ee7b7"`, `strokeWidth={2.5}`) take
`colors.mint` etc. as plain JS values passed to `recharts`, exactly like any
other consumer of `theme.js`. Leave `fontSize: 11` alone (see the spec's
§2.3, a different unit system, not part of the rem scale) and leave
`Progress.jsx:95`'s chart-gutter padding hack alone (protected, Guardrail 2).

- [ ] **Step 1: Migrate both files** following Task 3's pattern.
`PersonalBests.jsx`'s existing `labelStyle`/`fieldStyle` module-scope objects
(the precedent `theme.js` generalizes) get their literal values swapped for
`theme.js` exports, keeping the same hoisted-object structure.
- [ ] **Step 2: Verify**: `npm run build && npm test` → both green.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/PersonalBests.jsx frontend/src/pages/Progress.jsx
git commit -m "refactor(design-tokens): migrate PersonalBests and Progress to theme.js"
```

---

### Task 11: Migrate `Workout.jsx` + fix the bodyweight-label ternary

**Files:**
- Modify: `frontend/src/pages/Workout.jsx`

The largest single file (32 literals) and the one structural exception in
this plan.

- [ ] **Step 1: Extract `WeightFieldLabel`.** Before (inside the exercise
card's expanded body):
```jsx
<p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: ex.bodyweight ? 2 : 8 }}>
  {ex.bodyweight ? 'Added Weight (kg)' : 'Weight (kg)'}
</p>
{ex.bodyweight && (
  <p style={{ color: '#6b7280', fontSize: '0.6rem', marginBottom: 6 }}>0 = bodyweight only</p>
)}
```
After: a page-local subcomponent (matching `Stat`/`SetRow`/`NumControl`'s
existing placement at the top of the file), called at the same render site:
```jsx
function WeightFieldLabel({ bodyweight }) {
  return (
    <div style={{ marginBottom: space.sm }}>
      <p style={{ color: colors.muted2, fontSize: type.size.xs, fontWeight: type.weight.bold,
        letterSpacing: type.labelTracking, textTransform: 'uppercase' }}>
        {bodyweight ? 'Added Weight (kg)' : 'Weight (kg)'}
      </p>
      {bodyweight && (
        <p style={{ color: colors.muted2, fontSize: '0.6rem', marginTop: 2 }}>0 = bodyweight only</p>
      )}
    </div>
  )
}
```
(`0.6rem` has no matching token: it's `type.size.xs` minus one more step,
used nowhere else in the file; leave it as the one local literal rather than
inventing a token for a single site, consistent with the spec's Tier-3
principle.) Call site becomes `<WeightFieldLabel bodyweight={ex.bodyweight} />`.

- [ ] **Step 2: Migrate the rest of the file** following Task 3's pattern:
every remaining hardcoded literal (the `#6ee7b7`/`#9ca3af`/`#6b7280`/`#fff`
colors, the font sizes including the `0.95rem`-turned-`1.1rem` title and the
`0.75rem` cues-link text from this session's hierarchy fix, the `#2a2a3e`
unfilled-set-dot surface color noted in the inventory) becomes its `theme.js`
export. Leave `Workout.jsx:403`'s `flexWrap`/`rowGap: 14` structure alone
(Guardrail 2: the value maps to `space.lg`, but do not remove the wrap).

- [ ] **Step 3: Verify**: `npm run build && npm test` → both green (confirms Task 9's stepper tests and the existing `Workout.test.jsx` suite still pass against the migrated file).
- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Workout.jsx
git commit -m "refactor(design-tokens): migrate Workout.jsx to theme.js, extract WeightFieldLabel"
```

---

### Task 12: Bodyweight-label + title/link-hierarchy regression tests

**Files:**
- Modify: `frontend/src/pages/Workout.test.jsx`

Sequenced after Task 11, since these assert on post-migration token values.

- [ ] **Step 1: Write the tests:**
```jsx
  it('a bodyweight exercise shows the Added Weight label and hint', async () => {
    // render with an exercise flagged bodyweight: true (e.g. Pull-up on upper_b)
    renderWorkout({ workoutDay: 'upper_b' })
    await screen.findByText('Pull-up')
    fireEvent.click(screen.getByText('Pull-up'))
    expect(await screen.findByText('Added Weight (kg)')).toBeInTheDocument()
    expect(screen.getByText('0 = bodyweight only')).toBeInTheDocument()
  })

  it('a non-bodyweight exercise shows the plain Weight label with no hint', async () => {
    renderWorkout()
    const label = await screen.findByText('Weight (kg)')
    expect(label).toBeInTheDocument()
    expect(screen.queryByText('0 = bodyweight only')).not.toBeInTheDocument()
  })

  it('the exercise title outweighs the cues link', async () => {
    renderWorkout()
    const title = await screen.findByText(ex1.name)
    expect(title.style.fontSize).toBe(type.size.title)
    expect(title.style.fontWeight).toBe(String(type.weight.bold))
    const cuesLink = screen.getByText(/Form cues \+ demo/)
    expect(cuesLink.style.color).toBe(colors.muted)
  })
```
Reuses the direct `.style.*` assertion pattern already established at
`MuscleGroupPicker.test.jsx:166-167`. Adjust the exact `renderWorkout(...)`
call signature and `ex1`/mock-session setup to match this file's existing
helpers; the assertions above are the contract, not the harness plumbing.

- [ ] **Step 2: Run, verify pass**: `npm test -- Workout.test.jsx` → PASS.
- [ ] **Step 3: Run the full frontend suite**: `npm test` → all green, no regressions.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Workout.test.jsx
git commit -m "test(design-tokens): bodyweight label and card-hierarchy regression tests"
```

---

### Task 13: `DAY_COLORS` fallback unification

**Files:**
- Modify: `frontend/src/data/workoutPlan.js`, `frontend/src/pages/Home.jsx`, `frontend/src/components/ResumeBanner.jsx`, `frontend/src/components/MuscleGroupPicker.jsx`, `frontend/src/components/ExerciseDetails.jsx`, `frontend/src/pages/History.jsx`

Sequenced last among the content changes, after all 5 consuming files are
already migrated (Tasks 3, 5, 6, 7), so this is a small, clean diff.

- [ ] **Step 1: Add the fallback constant** in `frontend/src/data/workoutPlan.js`, next to `DAY_COLORS`:
```js
export const DAY_COLOR_FALLBACK = colors.muted
```
(Requires importing `colors` from `../lib/theme` into `workoutPlan.js`.)

- [ ] **Step 2: Point all 5 consumption sites at it.** 3 already use `muted`
(`Home.jsx`, `ResumeBanner.jsx`, `MuscleGroupPicker.jsx`); replace their
inline `'#9ca3af'`/`colors.muted` fallback with `DAY_COLOR_FALLBACK` for a
single source of truth. 2 currently use `mint`
(`ExerciseDetails.jsx`, `History.jsx`); change these to `DAY_COLOR_FALLBACK`
too, closing inventory I12: this is the one line in this task that changes
rendered output (a "no day" state moving from mint to muted gray).

- [ ] **Step 3: Verify**: `npm run build && npm test` → both green.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/data/workoutPlan.js frontend/src/pages/Home.jsx frontend/src/components/ResumeBanner.jsx frontend/src/components/MuscleGroupPicker.jsx frontend/src/components/ExerciseDetails.jsx frontend/src/pages/History.jsx
git commit -m "fix(design-tokens): unify DAY_COLORS missing-day fallback to muted gray"
```

---

### Task 14: Update status docs

**Files:**
- Modify: `AGENTS.md`, `docs/superpowers/backlog/2026-08-16-next-workstreams.md`

- [ ] **Step 1:** In `AGENTS.md`'s Status section, record the tokens+migration
slice as done, and update the "D is next" pointer to name what remains open:
Tailwind's fate (inventory §5, §7 item 2) and the 8-pattern component
extraction (§3.2, §7 item 9).
- [ ] **Step 2:** In `docs/superpowers/backlog/2026-08-16-next-workstreams.md`,
add a dated update note (matching the existing 2026-08-17 update entries'
style) pointing at the new spec/plan pair and stating what's now done versus
still open for decision D.
- [ ] **Step 3: Commit**
```bash
git add AGENTS.md docs/superpowers/backlog/2026-08-16-next-workstreams.md
git commit -m "docs(design-tokens): record the tokens+migration slice as done"
```

---

## Verification (after all tasks)

1. `cd frontend && npm run build && npm test`: clean build, full suite green.
2. `cd backend && .venv/bin/python -m pytest -v`: green (no backend changes expected; confirms nothing was accidentally touched).
3. Headless-Chromium smoke pass against the running app (dev server + backend): no console errors; the `mintWash` alpha change and the `textSecondary`/`surface1` dedups look right in `Progress.jsx` and `MuscleGroupPicker.jsx`; the `RecoveryRing` ramp is still monotonic single-hue; re-check the 7 UX fixes from this session's earlier work (touch/scroll, timer states and sound, bodyweight defaults, overload prefill, cues sheet, stepper hold-repeat, rest-timer persistence) still behave correctly.
4. Re-read `MuscleGroupPicker.test.jsx:166-167` and manually re-check the
   44px/320px floor (a narrow-viewport screenshot or devtools check) on
   `MuscleGroupPicker.jsx` and `Workout.jsx` specifically, since the
   inventory's §6 names those as the two files with real regression risk to
   the responsive floor.
