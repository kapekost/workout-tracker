# Sticky top bar + stable workout layout — design

**Date:** 2026-06-29
**Scope:** Small frontend UI update. Two independent pieces. No backend changes.

## Problem

1. **No persistent orientation while scrolling.** Long pages (History, Progress, the
   in-progress workout) have only a fixed *bottom* tab bar. Nothing stays at the top, so
   while scrolling you lose the "where am I" anchor.
2. **The in-progress workout layout jumps every set.** The fixed bottom `TimerBar` morphs
   between a thin one-line idle state ("Log a set to start rest timer") and a tall rest UI
   (−30 / large countdown / +30 / ⏸ / Skip). Logging a set grows it; rest ending shrinks it.
   That grow→shrink on every set makes the controls feel like they move — "flimsy to find
   the right button." The user's confirmed complaint is the **resizing**, not button count.

## Part A — Sticky top bar (all pages)

- New `TopBar` component, rendered once in `App.jsx` above the routed content.
- `position: sticky; top: 0` inside the existing `max-w-md mx-auto` container; opaque
  background (`#0a0a12`) with a subtle bottom border so scrolled content passes under it
  cleanly.
- Content: **left** = `🏋 Gym Tracker` brand; **right** = current page label derived from
  the route via `useLocation` (`Home` / `Progress` / `History` / `Workout` / `Exercise`).
- It is an orientation/label bar, **not** navigation. The bottom tab bar (`NavBar.jsx`)
  stays exactly as-is and remains the only real navigation.
- Page top paddings are reduced/adjusted so each page's existing large header sits just
  under the bar without an awkward double gap.

**Out of scope:** putting tabs in the top bar; removing the bottom tab bar.

## Part B — Stable (fixed-height) workout bottom

Make `TimerBar` a constant height so logging a set never resizes or reshuffles the bottom.

- The rest-controls row occupies a **reserved area of fixed height** that is present in
  both states.
- **Resting** (`restStartMs != null || paused`): live countdown + −30 / +30 / ⏸ / Skip —
  same as today.
- **Idle** (no active rest): the *same row, same height, same button slots* renders the
  controls **disabled/dimmed**, with the centre showing a calm "REST · Log a set" idle
  label instead of the big number. Buttons keep their exact positions; they just become
  non-interactive and muted.
- The session-elapsed line on the left is unchanged and present in both states.

Result: the bottom bar's height and every button position are identical whether or not a
rest timer is running. Nothing else on the workout screen is restructured.

**Out of scope (left as-is for now):** auto-advance scroll behaviour; the duplicate
"Finish" buttons (top-right + bottom). Can be revisited separately.

## Testing

- Largely visual/CSS. Existing `TimerBar` behaviour (countdown math, beep latch, pause)
  must be unchanged — covered by current `timer.test.js`; no logic changes intended, only
  render structure/styling.
- Manual check: log a set → confirm the bottom bar does not change height and buttons stay
  put; idle controls are visibly disabled.

## Deploy

- Mac-build → Pi deploy model unchanged. **Pi deploy is blocked** while off the home LAN
  (`192.168.1.170` unreachable); ship when back on-network.
- Also commit the currently-untracked `frontend/src/data/workoutPlan.js` (committed code
  imports it; a fresh clone/`git pull` would otherwise break the build).
