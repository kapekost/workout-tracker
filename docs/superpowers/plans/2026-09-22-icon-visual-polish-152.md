# Icon System & Visual Polish (#152) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every ad hoc emoji/text-glyph used as UI chrome with a vendored, consistent icon set — the flagged "Next up" fire-icon mismatch is fixed as one instance of the full sweep, not a special case.

**Architecture:** Vendor Heroicons-outline-style SVGs as small standalone JSX wrapper components under `frontend/src/icons/` (one file per icon, one shared prop shape), plus two bespoke hand-authored SVGs for workout-day identity and one bespoke barbell mark for the app brand (no Heroicons equivalents). Every consuming file swaps its literal emoji/glyph for the matching icon component; `workoutPlan.js`'s `emoji: '...'` field becomes `icon: 'upper'|'lower'`.

**Tech Stack:** React 19 (JSX, functional components), vitest + `@testing-library/react` (existing convention, see `DayAccent.test.jsx`), no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-14-visual-polish-design.md`, Section 2

## Global Constraints

- No new npm dependency (spec Sourcing; `DECISIONS.md` 2026-09-06).
- Icons sourced from Heroicons MIT `optimized/24/outline` set — copy only the glyphs needed.
- One consistent pattern for every icon: a small JSX wrapper component, never raw inline `<svg>` mixed in.
- Reuse existing tokens (`colors`, `space`, `type`) for sizing/color — no new hardcoded palette value.
- **`profile.icon` (the user's own chosen avatar emoji, #69's picker feature) is OUT of scope.** Only the `👤` *fallback* shown when a profile has no `icon` set is replaced. Touching `profile.icon` itself breaks a real feature and 8+ tests.

## Decisions this plan makes (spec left open)

1. **JSX wrapper per icon**, `aria-hidden="true"` by default (accessible name lives on the surrounding element's own `aria-label`/visible text, matching existing convention), `color="currentColor"` default:
   ```jsx
   export default function IconCheck({ size = 20, color = 'currentColor', ...props }) {
     return (
       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
         <path d="..." />
       </svg>
     )
   }
   ```
2. **Day icons = 2 body shapes + a variant dot**, not 4 pictograms: `IconDayUpper`/`IconDayLower`, composed with the existing `DayAccent` (`shape="dot"`, `size={6}`) for the A/B color distinction — reuses `DayAccent`'s existing `DAY_COLORS`/fallback resolution rather than re-deriving it.
3. **`workoutPlan.js`'s `emoji` field → `icon: 'upper'|'lower'`** (a string, not a component reference — keeps the data module React-free, matching its existing DOM-free test).
4. **Icon choices for ambiguous glyphs:** `☰` History tab → `IconClipboardList` (a hamburger glyph is itself the kind of default this sweep removes, so it's not preserved as the target). `⬡` Home → `IconHome`. `↗` Progress → `IconArrowTrendingUp`. `×` on a *destructive* trigger (ResumeBanner discard, SetRow/PersonalBests delete) → `IconTrash`, not a bare X (clearer than the glyph it replaces). `×`/`✗` on a *cancel/close* action (confirm-cancel, modal close) → `IconXMark`.
5. **Two extra sites found by re-running the spec's own mechanical grep today** (the 2026-09-14 table is 8 days stale — re-grepping is the spec's own prescribed check): `Exercise.jsx:16,28` and `PersonalBests.jsx:88`'s `← Back`/`← Progress`. Included as Task 5. The `›` disclosure chevron (`Home.jsx`, `ResumeBanner.jsx`'s "Resume ›") is **excluded** — a bare chevron is a near-universal disclosure convention, not emoji, and the spec's table never listed it.
6. **Size:** `20px` default, `16px`/`14px`/`12px` at smaller/nav-adjacent contexts, passed via `size` prop — no new `theme.js` token for this (spec's "efficient, not overengineered" constraint).
7. **`StatPair`'s `value` prop and `Toast`'s `message` both render as raw JSX children** (confirmed by reading both files — neither does a string operation on the value), so both icon call sites inside them (Task 4 Step 4, Task 4 Step 1's toast) convert to JSX directly, no exception needed.

---

## Task 1: Vendor the icon components

**Files:**
- Create: 18 files under `frontend/src/icons/` — `IconHome`, `IconArrowTrendingUp`, `IconClipboardList`, `IconUser`, `IconCheck`, `IconXMark`, `IconTrash`, `IconMinus`, `IconPlus`, `IconClock`, `IconExclamationTriangle`, `IconClipboardDocumentList`, `IconPencil`, `IconTrophy`, `IconSparkles`, `IconBolt`, `IconArrowLeft`, `IconBarbell` (bespoke)
- Create: `frontend/src/icons/index.js` (barrel export)
- Test: `frontend/src/icons/icons.test.jsx`

**Interfaces:**
- Produces: each icon as a default export `{ size = 20, color = 'currentColor', ...props }`, spread onto the root `<svg>`. `index.js` re-exports all by name.

- [ ] **Step 1: Write the failing test**
```jsx
// frontend/src/icons/icons.test.jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { IconHome, IconCheck, IconTrash, IconBarbell } from './index'

describe('icon components', () => {
  it('renders an svg at the default 20px size with currentColor stroke', () => {
    const { container } = render(<IconHome />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })
  it('is aria-hidden by default', () => {
    expect(render(<IconCheck />).container.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  })
  it('accepts a custom size', () => {
    const svg = render(<IconTrash size={16} />).container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('16')
  })
  it('spreads extra props onto the root svg', () => {
    expect(render(<IconBarbell className="my-class" />).container.querySelector('svg').getAttribute('class')).toBe('my-class')
  })
})
```

- [ ] **Step 2: Run — verify it fails.** `cd frontend && npx vitest run src/icons/icons.test.jsx` → FAIL, cannot resolve `./index`.

- [ ] **Step 3: Author every icon file** to the exact shared shape in Decision 1, one `viewBox="0 0 24 24"` SVG per file, path data copied from Heroicons `optimized/24/outline/<name>.svg` for the matching glyph (`home`, `check`, `trash`, `arrow-trending-up`, `clipboard-document-list`, `user`, `x-mark`, `minus`, `plus`, `clock`, `exclamation-triangle`, `pencil`, `trophy`, `sparkles`, `bolt`, `arrow-left`). `IconBarbell` is bespoke (no Heroicons source):
```jsx
// frontend/src/icons/IconBarbell.jsx
export default function IconBarbell({ size = 20, color = 'currentColor', ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <line x1="4" y1="12" x2="20" y2="12" />
      <rect x="2" y="8" width="3" height="8" rx="1" fill={color} stroke="none" />
      <rect x="19" y="8" width="3" height="8" rx="1" fill={color} stroke="none" />
      <rect x="6" y="9.5" width="2" height="5" rx="0.5" fill={color} stroke="none" />
      <rect x="16" y="9.5" width="2" height="5" rx="0.5" fill={color} stroke="none" />
    </svg>
  )
}
```
`index.js` re-exports all 18 by name (`export { default as IconHome } from './IconHome'`, etc.).

- [ ] **Step 4: Run — verify it passes.** Same command as Step 2 → PASS (4/4).

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/icons/
git commit -m "feat(icons): vendor Heroicons-outline icon set + bespoke barbell mark (#152)"
```

---

## Task 2: Workout-day identity icons

**Files:**
- Create: `frontend/src/icons/IconDayUpper.jsx`, `IconDayLower.jsx` (+ add to `index.js`)
- Create: `frontend/src/components/DayIcon.jsx`
- Test: `frontend/src/components/DayIcon.test.jsx`
- Modify: `frontend/src/data/workoutPlan.js:7,92,164,249` (re-grep `emoji:` first — line numbers may have drifted), `workoutPlan.test.js`

**Interfaces:**
- Consumes: Task 1's shared shape; `DayAccent` (unchanged) for color resolution.
- Produces: `<DayIcon day="upper_a" size={20} />`, used by every later task's day-identity call site. `PLAN[day].icon` is now `'upper'`/`'lower'`.

- [ ] **Step 1: Write the failing test**
```jsx
// frontend/src/components/DayIcon.test.jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DayIcon from './DayIcon'
import { DAY_COLORS, DAY_COLOR_FALLBACK } from '../data/workoutPlan'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('DayIcon', () => {
  it('renders one svg with an accent dot in the resolved day color', () => {
    const { container } = render(<DayIcon day="upper_a" />)
    expect(container.querySelectorAll('svg').length).toBe(1)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLORS.upper_a))
  })
  it('renders the lower-body shape for a lower day', () => {
    const { container } = render(<DayIcon day="lower_b" />)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLORS.lower_b))
  })
  it('falls back to DAY_COLOR_FALLBACK for an unrecognized day', () => {
    const { container } = render(<DayIcon day="bogus_day" />)
    expect(container.querySelector('[data-testid="day-icon-dot"]').style.background).toBe(hexToRgb(DAY_COLOR_FALLBACK))
  })
})
```

- [ ] **Step 2: Run — verify it fails.** `cd frontend && npx vitest run src/components/DayIcon.test.jsx` → FAIL, cannot resolve `./DayIcon`.

- [ ] **Step 3: Author `IconDayUpper.jsx`/`IconDayLower.jsx`** — same shared shape as Task 1, hand-drawn upper-body/lower-body silhouette outlines matching the vendored set's `1.2` stroke.

- [ ] **Step 4: Author `DayIcon.jsx`**
```jsx
// frontend/src/components/DayIcon.jsx
import IconDayUpper from '../icons/IconDayUpper'
import IconDayLower from '../icons/IconDayLower'
import DayAccent from './DayAccent'
import { PLAN } from '../data/workoutPlan'

export default function DayIcon({ day, size = 20 }) {
  const Body = PLAN[day]?.icon === 'lower' ? IconDayLower : IconDayUpper
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <Body size={size} />
      <span data-testid="day-icon-dot" style={{ position: 'absolute', bottom: -2, right: -2 }}>
        <DayAccent day={day} size={6} />
      </span>
    </span>
  )
}
```
(`DayAccent` already resolves `DAY_COLOR_FALLBACK` for an unrecognized day — relied on directly, not re-implemented.)

- [ ] **Step 5: Update `workoutPlan.js`'s four fields** — `emoji: '💪'`→`icon: 'upper'` (upper_a), `emoji: '🦵'`→`icon: 'lower'` (lower_a), `emoji: '🏋️'`→`icon: 'upper'` (upper_b), `emoji: '🔥'`→`icon: 'lower'` (lower_b). Fix any `.emoji` assertion in `workoutPlan.test.js` to `.icon` with the matching string.

- [ ] **Step 6: Run — verify pass.** `cd frontend && npx vitest run src/components/DayIcon.test.jsx src/data/workoutPlan.test.js` → PASS.

- [ ] **Step 7: Commit.**
```bash
git add frontend/src/icons/ frontend/src/components/DayIcon.jsx frontend/src/components/DayIcon.test.jsx frontend/src/data/workoutPlan.js frontend/src/data/workoutPlan.test.js
git commit -m "feat(icons): workout-day identity icons, replace the 4 day emoji (#152)"
```

---

## Task 3: Navigation chrome (NavBar, TopBar) + `DayIcon` call sites

**Files:** `NavBar.jsx:6-8`+render, `TopBar.jsx:63,87`, `TopBar.test.jsx`, `App.test.jsx:113,266`, `Home.jsx:17,116,187`, `Home.test.jsx`, `History.jsx:145`, `Workout.jsx:455`, `MuscleGroupPicker.jsx:143`, `ResumeBanner.jsx:21`+render, `ResumeBanner.test.jsx`

(Re-grep each line number against current `main` before editing — this plan's numbers may have drifted since research.)

**Interfaces:** consumes `DayIcon` (Task 2), `IconHome`/`IconArrowTrendingUp`/`IconClipboardList`/`IconUser`/`IconBarbell` (Task 1).

| Site | Before | After |
|---|---|---|
| `NavBar.jsx` tabs array | `{ path, label, icon: '⬡'\|'↗'\|'☰' }` | `{ path, label, Icon: IconHome\|IconArrowTrendingUp\|IconClipboardList }` |
| `NavBar.jsx` render | `<span style={{fontSize:'1.35rem'}}>{tab.icon}</span>` | `<tab.Icon size={22} color={isActive ? colors.accent : colors.muted} />` |
| `TopBar.jsx:63` | `🏋 Gym Tracker` | `<span style={{display:'flex',alignItems:'center',gap:6}}><IconBarbell size={16} />Gym Tracker</span>` |
| `TopBar.jsx:87` | `{profile.icon \|\| '👤'}` | `{profile.icon \|\| <IconUser size={16} />}` (`profile.icon` itself untouched) |
| `Home.jsx:17` fallback | `{ emoji: '🏋', ... }` | `{ icon: 'upper', ... }` |
| `Home.jsx:116` | `{next.emoji} {next.name}` | `<DayIcon day={next.id} /> {next.name}` |
| `Home.jsx:187` | `{lastPlan.emoji} {lastPlan.name}` | `<DayIcon day={lastPlan.id} /> {lastPlan.name}` |
| `History.jsx:145` | `{plan?.emoji} {plan?.name ?? s.workout_day}` | `{plan && <DayIcon day={s.workout_day} />} {plan?.name ?? s.workout_day}` |
| `Workout.jsx:455` | `{plan.emoji} {plan.name}` | `<DayIcon day={workoutDay} size={24} /> {plan.name}` (confirm the day-id variable name in scope) |
| `MuscleGroupPicker.jsx:143` | `→ {bestDay.emoji} {bestDay.name}` | `→ <DayIcon day={bestDay.id} size={16} /> {bestDay.name}` |
| `ResumeBanner.jsx:21` | `const label = plan ? \`${plan.emoji} ${plan.name}\` : 'Workout'` then `{label} in progress` | `const dayName = plan ? plan.name : 'Workout'` then `<span style={{display:'flex',alignItems:'center',gap:6}}>{plan && <DayIcon day={active.workout_day} size={16} />}{dayName} in progress</span>` |

- [ ] **Step 1: Apply the table above.** Add imports as needed.

- [ ] **Step 2: Fix the 8 `'🏋 Gym Tracker'` text assertions** in `TopBar.test.jsx`/`App.test.jsx` (`getByText`/`findByText`/`queryByText`) → `'Gym Tracker'` (icon is now a sibling `<svg>`, not part of the text node). **Leave `TopBar.test.jsx`'s `profile.icon` assertions (`getByText('💪')` etc.) untouched** — they test the unmodified emoji-picker feature.

- [ ] **Step 3: Run.** `cd frontend && npx vitest run src/components/TopBar.test.jsx src/App.test.jsx src/pages/Home.test.jsx src/pages/History.test.jsx src/pages/Workout.test.jsx src/components/MuscleGroupPicker.test.jsx src/components/ResumeBanner.test.jsx` → PASS; fix any other assertion the run surfaces.

- [ ] **Step 4: Commit.**
```bash
git add frontend/src/components/NavBar.jsx frontend/src/components/TopBar.jsx frontend/src/components/TopBar.test.jsx frontend/src/App.test.jsx frontend/src/pages/Home.jsx frontend/src/pages/Home.test.jsx frontend/src/pages/History.jsx frontend/src/pages/Workout.jsx frontend/src/components/MuscleGroupPicker.jsx frontend/src/components/ResumeBanner.jsx frontend/src/components/ResumeBanner.test.jsx
git commit -m "feat(icons): navigation chrome + day-icon call sites (#152)"
```

---

## Task 4: Status/feedback, functional, and achievement icons

**Files:** `ResumeBanner.jsx:41,43,47`, `Workout.jsx:58,126,140,268,280,322,466,513,538,547`, `PersonalBests.jsx:113`, `History.jsx:57,148,149(⏱)`, `TimerBar.jsx:46,49,56,65`, `VersionBadge.jsx:91`+test, `ExerciseCuesModal.jsx:63`, `Progress.jsx:63,81`+test

**Interfaces:** consumes `IconCheck`/`IconXMark`/`IconTrash`/`IconMinus`/`IconPlus`/`IconClock`/`IconBolt`/`IconExclamationTriangle`/`IconClipboardDocumentList`/`IconPencil`/`IconTrophy`/`IconSparkles` (Task 1).

| Site | Before | After |
|---|---|---|
| `ResumeBanner.jsx:41` confirm discard | `✓` (danger) | `<IconCheck size={16} color={colors.danger} />` |
| `ResumeBanner.jsx:43` cancel discard | `✗` (muted) | `<IconXMark size={16} color={colors.muted} />` |
| `ResumeBanner.jsx:47` discard trigger | `×` | `<IconTrash size={16} />` |
| `Workout.jsx:58` SetRow armed/unarmed | `armed ? '✓?' : '×'` | `armed ? <IconCheck size={18} /> : <IconTrash size={18} />` (existing color+aria-label swap already carries the confirm semantic — dropping `?` loses nothing) |
| `PersonalBests.jsx:113` same pattern | `armed ? '✓?' : '×'` | `armed ? <IconCheck size={18} /> : <IconTrash size={18} />` |
| `Workout.jsx:126` stepper decrease | `−` | `<IconMinus size={16} />` |
| `Workout.jsx:140` stepper increase | `+` | `<IconPlus size={16} />` |
| `TimerBar.jsx:56` | `−30` | `<IconMinus size={14} />30` |
| `TimerBar.jsx:65` | `+30` | `<IconPlus size={14} />30` |
| `TimerBar.jsx:46` session clock | `⏱ <span>{sessionStr}</span>` | `<IconClock size={16} /> <span>{sessionStr}</span>` |
| `TimerBar.jsx:49` wake-lock chip | `🔆<span>On</span>` | `<IconBolt size={14} /><span>On</span>` |
| `History.jsx:149` (`⏱ {duration}`, re-grep exact line) | `⏱ {sessionDuration(s)}` | `<IconClock size={12} /> {sessionDuration(s)}` |
| `VersionBadge.jsx:91` | `stale ? '⚠' : ''` | `stale ? <IconExclamationTriangle size={12} /> : null` |
| `ExerciseCuesModal.jsx:63` | `>×</button>` | `><IconXMark size={18} /></button>` |
| `Workout.jsx:466` Finish button | `'✓ Finish Workout'` | `<><IconCheck size={16} /> Finish Workout</>` (add flex row style if button isn't already flex) |
| `Workout.jsx:513` set-complete | `<span>✓</span>` | `<IconCheck size={14} color={color} />` |
| `Workout.jsx:538` | `📋 Form cues + demo` | `<IconClipboardDocumentList size={16} /> Form cues + demo` |
| `Workout.jsx:547` | `📝 {notes[ex.id]}` | `<IconPencil size={14} /> {notes[ex.id]}` |
| `Workout.jsx:268` | `Workout complete 🎉` | `Workout complete <IconSparkles size={20} style={{verticalAlign:'middle'}} />` |
| `Workout.jsx:280` | `` `🎉 New PR — ${prLabel(p)}` `` | `<><IconSparkles size={14} /> New PR — {prLabel(p)}</>` (already inside a `.map()` returning JSX) |
| `Workout.jsx:322` toast | `` showToast(\`🏆 PR! ${weight}kg on ${ex.name}\`) `` | `showToast(<><IconTrophy size={14} /> PR! {weight}kg on {ex.name}</>)` (`Toast.jsx` renders `{toast.message}` directly — confirmed it accepts a node, not just a string) |
| `Progress.jsx:63` | `🏆 PBs` | `<><IconTrophy size={14} /> PBs</>` (add flex row style if needed) |
| `Progress.jsx:81` `StatPair` value | `` value={\`🏆 ${pr} kg\`} `` | `value={<><IconTrophy size={14} /> {pr} kg</>}` (`StatPair` renders `{value}` directly — confirmed no string op) |
| `History.jsx:57` | `{best && ' 🏆'}` | `{best && <IconTrophy size={12} />}` |

- [ ] **Step 1: Apply the table above**, adding imports per file.

- [ ] **Step 2: Fix `VersionBadge.test.jsx:106,112`** — `toHaveTextContent('⚠')` fails against an `aria-hidden` SVG (contributes no text). Change both to `expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument()`.

- [ ] **Step 3: Fix `Progress.test.jsx`'s `'🏆 PBs'` assertion** — `expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['🏆 PBs'])`: an `aria-hidden` SVG contributes no `textContent`, so run the test first, read the actual reported string (leading/trailing whitespace from the JSX fragment), and match it exactly rather than guessing.

- [ ] **Step 4: Run.** `cd frontend && npx vitest run src/components/ResumeBanner.test.jsx src/pages/Workout.test.jsx src/pages/PersonalBests.test.jsx src/pages/History.test.jsx src/components/TimerBar.test.jsx src/components/VersionBadge.test.jsx src/components/ExerciseCuesModal.test.jsx src/pages/Progress.test.jsx` → PASS; fix any other glyph-text coupling the runner surfaces the same way.

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/components/ResumeBanner.jsx frontend/src/pages/Workout.jsx frontend/src/pages/PersonalBests.jsx frontend/src/pages/History.jsx frontend/src/pages/Progress.jsx frontend/src/pages/Progress.test.jsx frontend/src/components/TimerBar.jsx frontend/src/components/VersionBadge.jsx frontend/src/components/VersionBadge.test.jsx frontend/src/components/ExerciseCuesModal.jsx
git commit -m "feat(icons): status/feedback, functional, and achievement icons (#152)"
```

---

## Task 5: Back-arrow sweep (found in this plan's re-grep, not in the original spec table)

**Files:** `Exercise.jsx:16,28`, `PersonalBests.jsx:88` (+ their `.test.jsx` if either asserts on `←`)

- [ ] **Step 1: Apply.** `← Back` / `← Back to workout` / `← Progress` → `<IconArrowLeft size={16} /> Back` (etc.), adding flex-row style if the element isn't already flex.
- [ ] **Step 2: Run.** `cd frontend && npx vitest run src/pages/Exercise.test.jsx src/pages/PersonalBests.test.jsx` (skip `Exercise.test.jsx` if it doesn't exist — do not create one, out of this task's scope) → PASS.
- [ ] **Step 3: Commit.**
```bash
git add frontend/src/pages/Exercise.jsx frontend/src/pages/PersonalBests.jsx
git commit -m "feat(icons): replace ad hoc back-arrow glyphs found in this sweep's re-grep (#152)"
```

---

## Task 6: Full-sweep verification + UI/UX review gate

**Files:** none expected (verification only; if the grep below finds a real miss, fix it and fold the diff into the Task it belongs to, then re-run this grep).

- [ ] **Step 1: Mechanical emoji-range grep**, from repo root:
```bash
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{2B00}-\x{2BFF}]' --include='*.jsx' --include='*.js' frontend/src | grep -v '\.test\.'
```
Expected remaining hits — every one a deliberate exclusion (Decision 5), nothing else:
- `MuscleGroupPicker.jsx`'s `→` sentence separator ("Best day for X → ...").
- `Home.jsx`/`ResumeBanner.jsx`'s `›` disclosure chevron.
- Code comments referencing an old glyph (e.g. `useWakeLock.js`'s `hide→show`, `Workout.jsx:448`'s comment).
- `api.js`'s developer-facing error template (`` `API ${method} ${path} → ${res.status}` ``).

Anything else on the list is a real miss — fix it, attribute to the covering Task, re-run.

- [ ] **Step 2: Confirm `profile.icon` is untouched.**
```bash
git diff origin/main -- frontend/src/components/TopBar.jsx frontend/src/components/TopBar.test.jsx frontend/src/App.test.jsx | grep -n "profile.icon"
```
Expected: no hits beyond the deliberate `👤` fallback change (Task 3).

- [ ] **Step 3: Run the full frontend suite.** `cd frontend && npm test` → PASS, same total test count as `main` (this sweep restructures assertions, it doesn't add/remove test cases — a changed count signals an accidental deletion/duplication).

- [ ] **Step 4: Render it and look at it.** Per the standing UI gate (`DECISIONS.md` 2026-09-06, `PLAYBOOK.md` step 5): run the app, open every touched screen — Home, Progress, History, Personal Bests, a Workout session (Finish screen + mid-set delete-confirm, both armed/unarmed), Exercise detail, NavBar, TopBar (logged-in and auth-screen chrome-free) — screenshot each, including both states of every armed/unarmed toggle.

- [ ] **Step 5: UI-expert review + separate UX-expert review**, per `PLAYBOOK.md` step 5 / `DECISIONS.md` 2026-09-14 — both against the Step 4 screenshots, not the JSX. UI: hierarchy, spacing, icon-weight/size consistency across all ~20 icons, alignment. UX: does `IconTrash`/`IconCheck` alone (no `?`) still clearly read as delete-vs-confirm; flow; one-handed reachability. They may disagree — keep both passes separate.

- [ ] **Step 6: Fix anything flagged, re-screenshot and re-review only the changed screen(s).**
