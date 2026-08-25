# Shared component extraction: implementation plan

**Goal:** Build the 6 shared components the design-system inventory's §3.2 evidenced, resolve the `NumControl`/global-CSS conflict, sweep all call sites, without touching `MuscleGroupPicker.jsx` or any protected guardrail.

**Spec:** [`../specs/2026-08-25-component-extraction-design.md`](../specs/2026-08-25-component-extraction-design.md)

**Depends on:** Upgrade 1 already landed (`frontend/src/lib/theme.js` exists and all 14 files are migrated).

## Global constraints
- Every new component imports only from `theme.js` — zero new hardcoded color/size/weight/spacing literals.
- `MuscleGroupPicker.jsx` is out of scope entirely for this plan.
- `cd frontend && npm run build && npm test` green after every task.
- Frontend only.

---

### Task 1: `<Eyebrow>` + `useToast()`/`<Toast>`

**Files:** Create `frontend/src/components/Eyebrow.jsx` (+ test), `frontend/src/lib/useToast.js` (+ test), `frontend/src/components/Toast.jsx`

- [ ] Step 1: `<Eyebrow>`: `{ children, color = colors.muted2, size = type.size.xs, style }` rendering a `<p>` with the uppercase-label styling (bold, `type.labelTracking`, `textTransform: uppercase`), spreading any extra `style` last so a call site can still override where its current value genuinely differs from the default.
- [ ] Step 2: `useToast()`: returns `{ toast, showToast(message, type = 'default') }`; internally owns `useState` + a 2500ms `setTimeout` clear, matching the current behavior at all 5 existing call sites exactly (same delay, same clear-on-unmount if any site currently does that — check).
- [ ] Step 3: `<Toast>`: `{ toast }` (the object from the hook), renders `null` when empty, otherwise the existing `.toast`/`.toast.error` markup unchanged.
- [ ] Step 4: Tests: `Eyebrow.test.jsx` (renders children, applies default vs. override styling), `useToast.test.js` (shows, auto-clears after 2500ms via fake timers, a second call resets the timer).
- [ ] Step 5: `npm run build && npm test` — both green (new files only, no call sites migrated yet).
- [ ] Step 6: Commit
```bash
git add frontend/src/components/Eyebrow.jsx frontend/src/components/Eyebrow.test.jsx frontend/src/lib/useToast.js frontend/src/lib/useToast.test.js frontend/src/components/Toast.jsx
git commit -m "feat(component-extraction): add Eyebrow and useToast/Toast primitives"
```

### Task 2: `<Chip>` + `<EmptyState>` + `<DayAccent>`

**Files:** Create `frontend/src/components/Chip.jsx` (+ test), `frontend/src/components/EmptyState.jsx` (+ test), `frontend/src/components/DayAccent.jsx` (+ test)

- [ ] Step 1: `<Chip>`: `{ children, color = colors.mint, selected, size = 'md' }`. Base styling: padding `'5px 14px'`, `type.size.md`, `type.weight.semibold`, background `colors.border`, no border by default; when `selected` is a defined prop (i.e. the caller is using it as a toggle, `Progress.jsx`'s case), background/border swap to the `color`-tinted "active" treatment `Progress.jsx` currently hand-rolls. When `selected` is `undefined` (the stateless muscle-chip case), render the plain form.
- [ ] Step 2: `<EmptyState>`: `{ title, subtitle }`, `card` className, `textAlign: center`, `padding: space.xxxl` (32), title styled `colors.muted2`, subtitle `colors.muted`/`type.size.md` (0.8rem) with `marginTop: space.xs`.
- [ ] Step 3: `<DayAccent>`: `{ day, shape = 'dot', size }`. Resolves color via `DAY_COLORS[day] ?? DAY_COLOR_FALLBACK` (from Upgrade 1's Task 13 — import both from `workoutPlan.js`). `shape="dot"`: circular, `size` defaulting to 8. `shape="bar"`: `8×36`, `radius.sm` (matches `History.jsx`'s current bar).
- [ ] Step 4: Tests for each: renders with defaults, `<Chip selected>` toggles the active treatment, `<DayAccent>` falls back correctly for an unknown/missing day.
- [ ] Step 5: `npm run build && npm test` — both green.
- [ ] Step 6: Commit
```bash
git add frontend/src/components/Chip.jsx frontend/src/components/Chip.test.jsx frontend/src/components/EmptyState.jsx frontend/src/components/EmptyState.test.jsx frontend/src/components/DayAccent.jsx frontend/src/components/DayAccent.test.jsx
git commit -m "feat(component-extraction): add Chip, EmptyState, and DayAccent primitives"
```

### Task 3: `<DisclosureRow>` + the number-input dead-code removal

**Files:** Create `frontend/src/components/DisclosureRow.jsx` (+ test); modify `frontend/src/index.css`

- [ ] Step 1: `<DisclosureRow>`: `{ header, isOpen, onToggle, children }` — `card` wrapper with `overflow: hidden`, a header row (`padding: '14px 16px'`, click target calling `onToggle`) rendering `header` plus the chevron glyph (`∧` when open, `∨` when closed, `colors.muted`, `1.1rem`), and `children` rendered only when `isOpen`. Byte-for-byte match to the current `Workout.jsx`/`History.jsx` markup.
- [ ] Step 2: Grep the whole frontend for any `input[type="number"]` other than the one `NumControl` renders, to confirm the inventory's "confirmed dead" claim about `index.css:102-114` still holds. If confirmed, delete that CSS block.
- [ ] Step 3: Test: `<DisclosureRow>` toggles `children` visibility and calls `onToggle`, chevron glyph flips.
- [ ] Step 4: `npm run build && npm test` — both green.
- [ ] Step 5: Commit
```bash
git add frontend/src/components/DisclosureRow.jsx frontend/src/components/DisclosureRow.test.jsx frontend/src/index.css
git commit -m "feat(component-extraction): add DisclosureRow, remove dead input[type=number] rule"
```

### Task 4: Sweep call sites

**Files:** Modify `frontend/src/pages/Workout.jsx`, `frontend/src/pages/Home.jsx`, `frontend/src/pages/History.jsx`, `frontend/src/pages/Progress.jsx`, `frontend/src/pages/Exercise.jsx`, `frontend/src/components/ResumeBanner.jsx`, and any other file with a hand-rolled instance of the 6 patterns

- [ ] Step 1: One commit per pattern (not per file) keeps each diff reviewable against one specific behavior claim:
  - Eyebrow: all 16 sites (re-grep against the inventory's §3.2b table to confirm none are missed).
  - Toast: all 5 sites (`Workout.jsx`, `Home.jsx` ×2, `History.jsx`) onto `useToast()`/`<Toast>`.
  - Chip: `Workout.jsx`'s muscle chip, `Exercise.jsx`'s muscle chip, `Progress.jsx`'s filter chip.
  - EmptyState: `Home.jsx`, `Progress.jsx`, `History.jsx`.
  - DayAccent: `ResumeBanner.jsx`, `Workout.jsx`'s set-dots, `History.jsx`'s bar.
  - DisclosureRow: `Workout.jsx`, `History.jsx`.
- [ ] Step 2: After each pattern's sweep, `npm run build && npm test` before moving to the next pattern — isolates which sweep introduced a regression if one appears.
- [ ] Step 3: Manual 320px browser check on `Workout.jsx` and `History.jsx` specifically (heaviest concentration of swept patterns) — no overflow, tap targets unchanged.
- [ ] Step 4: Manual check: `MuscleGroupPicker.jsx`'s `RecoveryRing` ramp is unaffected (it wasn't touched, but confirm nothing it imports from shared files changed its behavior).
- [ ] Step 5: Commit each pattern's sweep separately
```bash
git commit -m "refactor(component-extraction): sweep <pattern> call sites onto <Component>"
```
(repeated per pattern)

### Task 5: Update status docs

**Files:** Modify `AGENTS.md`

- [ ] Step 1: Record the component-extraction slice as done in AGENTS.md's Status section, matching this repo's own convention.
- [ ] Step 2: Commit
```bash
git add AGENTS.md
git commit -m "docs(component-extraction): record the shared-component slice as done"
```

## Verification (after all tasks)
1. `cd frontend && npm run build && npm test` — clean build, full suite green.
2. `cd backend && .venv/bin/python -m pytest -v` — green, untouched.
3. Manual 320px pass on `Workout.jsx`/`History.jsx`; `RecoveryRing` ramp re-confirmed unaffected.
4. Grep confirms no remaining hand-rolled instance of any of the 6 swept patterns outside the new components (excluding `MuscleGroupPicker.jsx`, out of scope by design).
