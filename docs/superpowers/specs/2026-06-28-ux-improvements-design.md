# Design: UX Improvements (timer reliability, glanceability, logging loop)

_Date: 2026-06-28_

## Summary

Act on the UI/UX review of the gym-tracker PWA. Three batches, all frontend:

1. **Timer reliability** — keep the screen awake during a workout (Wake Lock),
   add vibration as a rest-end cue, and replace blocking `alert()`/`confirm()`
   with non-blocking in-app feedback (they freeze the JS event loop and stall
   the timer).
2. **Glanceability & accessibility** — make the rest countdown the high-contrast
   hero, fix WCAG-AA contrast on muted greys, enforce ≥44px tap targets, honor
   `prefers-reduced-motion`.
3. **Logging loop ergonomics** — auto-expand/advance the active exercise,
   prefill weight/reps per-exercise, and allow typing the weight directly.

No backend changes. No new runtime npm dependencies.

## Context / constraints

- Mobile-first PWA, used one-handed in a gym. Dark theme, per-day accent color,
  bottom tab nav, sticky TimerBar. Heavy inline styles + a few CSS classes.
- Timer is already timestamp-derived (accurate after background/standby); the
  gaps are screen-sleep and the missed rest-end beep — both addressed here.
- iOS standalone PWA: Wake Lock supported on iOS 16.4+; **Vibration API is NOT
  supported on iOS** (vibration helps Android only — still worth adding, guarded).

---

## Batch 1 — Timer reliability

### Wake Lock
- New hook `useWakeLock(active)` in `frontend/src/lib/useWakeLock.js`:
  - When `active` is true, request `navigator.wakeLock.request('screen')`.
  - Re-acquire on `document` `visibilitychange` → visible (the lock auto-releases
    when the tab hides).
  - Release and remove listeners on cleanup / when `active` becomes false.
  - No-op gracefully when `navigator.wakeLock` is undefined (returns a `supported`
    flag).
- `Workout.jsx` calls `useWakeLock(true)` while the session screen is mounted.
- TimerBar shows a small status pill: `🔆 Screen on` when the lock is held,
  nothing when unsupported. (No user toggle for v1 — always on during a session;
  ~1h workout battery cost is acceptable. YAGNI.)

### Vibration
- In TimerBar, when the rest timer reaches 0, in addition to the beep+flash, call
  `navigator.vibrate?.([300, 150, 300])` (guarded; no-op where unsupported).

### Non-blocking feedback (no more `alert()`/`confirm()`)
- Toast gains a variant: `showToast(msg, type)` where `type` is `'success'`
  (default, mint/amber) or `'error'` (red). Add `.toast.error` CSS.
- Replace every `alert(...)` with an error toast:
  - `Workout.jsx` (set-log fail, delete-set fail, finish fail)
  - `Home.jsx` (start-session fail) — add a local toast to Home.
- Replace `confirm('Delete this session?')` in `History.jsx` with an **inline
  two-tap confirm**: the "Delete session" button becomes "Tap again to confirm"
  for 3s, then reverts; second tap within the window deletes. Delete failure →
  error toast (add a local toast to History).

---

## Batch 2 — Glanceability & accessibility

### TimerBar redesign
- Rest countdown becomes the visual hero: large mono (~2.2rem), near-white
  (`#fff`) high contrast — readable across a gym. The session clock is demoted
  to small muted text.
- Non-color state cue: label reads **REST** while counting and flips to **GO**
  at 0 (so state isn't conveyed by color alone).
- Verify the bar still clears the nav with safe-area (`env(safe-area-inset-bottom)`).

### Contrast tokens (WCAG AA)
- Add CSS variables: `--muted: #9ca3af` (~7:1 on bg) and `--muted-2: #6b7280`.
- Replace informational text currently using `#4a5568` (~2.5:1, fails AA) and
  borderline `#6b7280` with `--muted` for anything a user must read (dates,
  labels, "Loading…", hints, captions, inactive nav labels/icons). Reserve
  `#4a5568`-level only for purely decorative glyphs.
- Applies across Home/Workout/Exercise/History/Progress/NavBar/TimerBar.

### Tap targets ≥44px
- `.btn-icon` → 44×44 (from 40).
- Set-delete "×" in `Workout.jsx` → 44px padded hit area.
- TimerBar "Skip" / ±30 → min-height 44.
- NavBar buttons → min-height 48.

### prefers-reduced-motion
- CSS `@media (prefers-reduced-motion: reduce)` neutralizes the `.timer-bar.flash`
  animation and `.toast` slide.
- JS: in `Exercise.jsx`, if `matchMedia('(prefers-reduced-motion: reduce)')`
  matches, do NOT start the frame-alternation interval (show frame 0). In
  TimerBar, skip the flash (beep + vibrate still fire).

---

## Batch 3 — Logging loop ergonomics

### Auto-expand / auto-advance
- New pure helper `nextIncompleteExerciseId(exercises, sets)` in
  `frontend/src/lib/workoutFlow.js`: returns the id of the first exercise whose
  logged-set count < its target `sets`, or `null` if all complete.
- On load, auto-expand that exercise. After logging a set that brings an exercise
  to its target, auto-expand the next incomplete one. Manual expand/collapse still
  works (auto-advance only fires on completion, doesn't fight the user).

### Per-exercise weight/reps prefill
- New pure helper `prefillFor(exerciseId, sets, progressMaxByExercise)` in
  `workoutFlow.js`: returns `{ weight, reps }` from the last logged set of THAT
  exercise in this session; else `{ weight: progressMax, reps: 8 }` if a prior
  best exists; else `{ weight: 20, reps: 8 }`.
- When an exercise becomes the active/expanded one, set the weight/reps steppers
  from `prefillFor(...)`. (Fixes 60kg Bench carrying into OHP.)

### Typeable steppers
- `NumControl` input becomes editable: remove `readOnly`, keep `type=number`,
  add `inputMode` (`decimal` for weight, `numeric` for reps), clamp to `min` on
  change/blur. The ± buttons remain the fine step (2.5 weight, 1 reps).

---

## Out of scope
- Backend changes; new dependencies.
- Per-exercise configurable rest defaults; estimated-1RM PR detection; replacing
  the demo with real video/GIF; full inline-style→token migration (only the
  contrast-related colors are tokenized now).
- A user-facing Wake Lock toggle.

## Testing
- Pure helpers (`workoutFlow.js`) unit-tested with Vitest:
  `nextIncompleteExerciseId` (first incomplete / all complete / partial) and
  `prefillFor` (this-session last set / progress fallback / default).
- Wake Lock, vibration, toasts, contrast, tap-target sizes, reduced-motion, and
  the TimerBar redesign are verified by `npm run build` + manual smoke (no pure
  logic to unit-test).

## Deploy impact
- Frontend-only; same Mac-build → Pi flow. Rebuild + redeploy when ready.
