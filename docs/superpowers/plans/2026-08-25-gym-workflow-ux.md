# Gym-workflow UX fixes: implementation plan

**Goal:** Ship the one surviving deferred UI item, fix the 5 dimensional bugs the design-tokens spec found and explicitly deferred, apply `dataviz` to the Progress screen, and close out any remaining Upgrade-3 component gaps.

**Spec:** [`../specs/2026-08-25-gym-workflow-ux-design.md`](../specs/2026-08-25-gym-workflow-ux-design.md)

**Depends on:** Upgrade 3 landed.

---

### Task 1: Idle rest-timer hint

**Files:** Modify `frontend/src/components/TimerBar.jsx`; extend `frontend/src/components/TimerBar.test.jsx`

- [ ] Step 1: Check `activeSession.jsx`/`sessionStats.js` for whether "at least one set logged this session" is already tracked; if not, thread the minimal signal needed (a boolean or count) from the session context into `TimerBar`'s props.
- [ ] Step 2: Write the failing test first: a 5th state in `TimerBar.test.jsx` — no rest active AND zero sets logged — asserting the new hint copy renders instead of `READY`.
- [ ] Step 3: Implement: `TimerBar` renders the hint copy when idle and the "no sets yet" signal is true, falls back to the existing `READY`/`—:—` idle state once at least one set exists.
- [ ] Step 4: `npm test -- TimerBar.test.jsx` → pass (5 states total). `npm run build && npm test` → both green.
- [ ] Step 5: Commit
```bash
git add frontend/src/components/TimerBar.jsx frontend/src/components/TimerBar.test.jsx
git commit -m "feat(gym-ux): idle rest-timer hint before the first set is logged"
```

### Task 2: I13 + I15 — shared max-width and gutter constants

**Files:** Modify `frontend/src/index.css`

- [ ] Step 1: Point `.timer-bar { max-width: 480px }` (`index.css:134`) at the same `28rem` value `.page-shell` uses — either a shared CSS custom property (e.g. `--content-max-width: 28rem`, referenced by both rules) or a literal `28rem` in both places with a comment linking them. Prefer the custom property: it's the mechanism that actually prevents future drift, not just a comment promising someone will remember.
- [ ] Step 2: Express `.toast`'s `max-width: calc(100vw - 32px)` (`index.css:122`) in terms of the same gutter `.page-shell` uses (`1rem` each side) — `calc(100vw - 2 * 1rem)` or a shared `--page-gutter: 1rem` custom property referenced by both.
- [ ] Step 3: Manual browser check at 320px and at a wider viewport (e.g. 480px+, where `.timer-bar`'s max-width actually engages): confirm no visible change from before this task.
- [ ] Step 4: `npm run build && npm test` → both green.
- [ ] Step 5: Commit
```bash
git add frontend/src/index.css
git commit -m "fix(gym-ux): single source of truth for content max-width and page gutter (I13, I15)"
```

### Task 3: I14 — doubled bottom padding on Workout.jsx

**Files:** Modify `frontend/src/pages/Workout.jsx`, possibly `frontend/src/App.jsx`

- [ ] Step 1: Measure the actual rendered gap between the last visible card and the bottom chrome (`TimerBar` + `NavBar` stacked) on `Workout.jsx` today, in a real browser — record the number.
- [ ] Step 2: Determine whether `.page-shell`'s 96px alone is sufficient clearance for `Workout.jsx` specifically (it's the only page with both `TimerBar` and `NavBar` visible at once) or whether the extra 96px is load-bearing.
- [ ] Step 3a: If redundant, remove `Workout.jsx`'s explicit `paddingBottom: 96` (`Workout.jsx:279`) and rely on `.page-shell` alone.
- [ ] Step 3b: If load-bearing, keep it but replace the bare `96` with a named constant from `theme.js`'s `space` export (or a new one if none fits) and add a one-line comment stating why this page needs double clearance (TimerBar + NavBar both present) — turn the mystery number into a documented one rather than deleting something that's actually needed.
- [ ] Step 4: Verify at 320px and on a taller viewport: no content is hidden behind `TimerBar`/`NavBar`, no excess dead space either.
- [ ] Step 5: `npm run build && npm test` → both green.
- [ ] Step 6: Commit
```bash
git add frontend/src/pages/Workout.jsx
git commit -m "fix(gym-ux): resolve Workout.jsx's doubled bottom padding (I14)"
```

### Task 4: I16 (verify first) + I17 — safe-area handling

**Files:** Modify `frontend/src/index.css`, `frontend/src/components/NavBar.jsx`

- [ ] Step 1: **Verify I16 in a real browser before changing anything**: compare `.timer-bar`'s `bottom: calc(64px + env(safe-area-inset-bottom))` against `NavBar`'s actual rendered height. If there's a visible gap or overlap, fix the `64px` to match `NavBar`'s real height; if not, leave the constant as-is and note in the commit message that it was checked and found not to be a live defect.
- [ ] Step 2: I17: change `NavBar.jsx:19`'s flat `padding: '8px 0 20px'` bottom value to `env(safe-area-inset-bottom)`-aware — e.g. `paddingBottom: 'max(8px, env(safe-area-inset-bottom))'` or similar, matching the pattern `.timer-bar` already uses. Test on both a non-notched viewport (should look unchanged) and, if possible, a notched-device simulation in devtools.
- [ ] Step 3: `npm run build && npm test` → both green.
- [ ] Step 4: Commit
```bash
git add frontend/src/index.css frontend/src/components/NavBar.jsx
git commit -m "fix(gym-ux): consistent safe-area handling between TimerBar and NavBar (I16, I17)"
```

### Task 5: Progress-screen dataviz pass

**Files:** Modify `frontend/src/pages/Progress.jsx`

- [ ] Step 1: Load the `dataviz` skill. Audit the existing `LineChart` (colors, gridlines, tooltip, axis tick legibility at `fontSize: 11`) against its guidance.
- [ ] Step 2: Apply only the changes `dataviz` actually flags as real issues — this is a targeted pass, not a chart rebuild. Leave `Progress.jsx:95`'s chart-gutter padding hack alone (protected, Upgrade 1's Guardrail 2 carries forward).
- [ ] Step 3: Manual check: the chart still renders correctly at 320px, PR detection / recent-60-sessions behavior is visually unchanged.
- [ ] Step 4: `npm run build && npm test` → both green.
- [ ] Step 5: Commit
```bash
git add frontend/src/pages/Progress.jsx
git commit -m "polish(gym-ux): apply dataviz guidance to the Progress chart"
```

### Task 6: Final sweep + smoke pass

**Files:** Whatever Step 1 finds, if anything

- [ ] Step 1: Re-check the inventory's component-vocabulary findings against the current state of the app; apply `<EmptyState>`/`<Eyebrow>` (Upgrade 3) to any site still inconsistent.
- [ ] Step 2: Real-viewport 320px smoke pass (Upgrade 4's Playwright suite if it's landed, otherwise manual devtools) re-confirming: the 7 previously-shipped UX fixes, this upgrade's 6 items, and no new horizontal overflow or sub-44px tap target anywhere touched.
- [ ] Step 3: Update AGENTS.md Status and `docs/CHANGELOG.md` — this closes out the 5-upgrade initiative, so summarize all five here per this repo's own convention (Status current, shipped work moved to CHANGELOG).
- [ ] Step 4: Commit
```bash
git add AGENTS.md docs/CHANGELOG.md
git commit -m "docs(gym-ux): record the UI/UX upgrade initiative as shipped"
```

## Verification (after all tasks)
1. `cd frontend && npm run build && npm test` — clean, full suite green.
2. `cd backend && .venv/bin/python -m pytest -v` — green, untouched.
3. 320px real-viewport pass, no regressions anywhere touched across all 5 upgrades.
4. AGENTS.md and CHANGELOG reflect the shipped state.
