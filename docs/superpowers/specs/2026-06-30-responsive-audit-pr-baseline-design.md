# Responsive UI Audit + Personal-Best Baseline Fix — Design

**Date:** 2026-06-30
**Status:** Approved (brainstorm) — pending implementation plan

Two independent pieces of work, planned together in one spec but kept as
separate sections. Part A is a narrow backend logic fix; Part B is a broad
manual UI pass. They share no code or state.

---

## Part A — Personal-best baseline fix

### Problem

`session_prs()` in `backend/main.py` treats a first-ever entry as a personal
record. Every PR check is gated like:

```python
if not psets or cur_w > max(p["weight_kg"] for p in psets):
    prs.append({"type": "weight", ...})
```

The `not psets` branch fires a PR when there is **no** prior history. So the
first time an exercise is logged it produces a weight PR, a reps PR, and a 1RM
PR; the first completed session also fires a volume PR. PRs are not persisted —
they are computed on the fly at session finish (`GET /api/sessions/{sid}/prs`)
and shown in the finish summary — so this is a pure computation change with no
data migration.

### Principle

**A PR requires a prior value to beat. No prior value = baseline = no PR.**
Applied uniformly to all four types: `weight`, `reps`, `1rm`, `volume`.

### Behavior

- An exercise with **no prior completed sets at all** emits a single
  `baseline` entry, not three per-metric PRs.
- The **first completed session ever** emits no `volume` PR (silently). The
  per-exercise baseline notes already convey "first time"; a session-volume
  baseline line would be noise.
- An **existing** exercise that hits a brand-new top weight this session fires
  a real `weight` PR, but does **not** fire a separate `reps` PR for reps at
  that new weight (no prior reps at that weight to beat) and does **not** show
  a baseline note (the exercise is not new). This removes the current
  double-counting.
- A baseline note keys on "this exercise has no prior completed history,"
  **not** per-metric — so a brand-new exercise yields exactly one baseline
  line.

### Backend changes (`backend/main.py` → `session_prs`)

- Replace each `not psets or …` / `not prior_* or …` guard with
  "prior exists **and** current beats it."
- When an exercise has no prior sets at all, append
  `{"type": "baseline", "exercise_name": name}` in place of the
  weight/reps/1RM entries for that exercise.
- Volume: only compare when prior session volumes exist; otherwise emit
  nothing.

### Backend tests (`backend/test_main.py`)

- First-ever exercise → one `baseline` entry, zero PRs.
- First completed session → no `volume` PR.
- Second session beating the baseline → real `weight`/`reps`/`1rm` PRs.
- New top weight on an existing exercise → `weight` PR only, no `reps` PR,
  no baseline note.

### Frontend changes (`frontend/src/pages/Workout.jsx`)

- Summary render (`prLabel` / the `serverPrs.map`): a `baseline` entry renders
  muted (grey, no 🏆/🎉), e.g. "Bench Press — baseline set". Real PRs keep the
  gold 🎉 styling.
- In-workout toast logic is already correct — it only fires when `prs[ex.id]`
  exists (i.e. there was prior data) — so no change there.

---

## Part B — Responsive UI audit

### Goal

Every page reads and displays correctly with no cut-off/clipped controls,
across the realistic phone-to-tablet range, portrait only. General audit — no
single known bug; sweep everything.

### Pages and states

- **Home** — next-up card, 6-exercise list, Start button, recent-sessions list
  and empty state.
- **Workout** — TopBar, TimerBar (resting **and** not-resting), exercise card
  collapsed/expanded, logger controls (±weight/reps, Log button), finish
  summary, toast.
- **Progress** — recharts graphs.
- **History** — session list and any detail/expanded view.
- **Exercise detail** — form cues + demo.

### Target widths (portrait)

320, 360, 375, 390, 430, 768 (tablet), 1024. Plus a short-screen pass at
320×568 to catch content trapped behind the fixed TimerBar + bottom nav.

### Defect criteria

- Horizontal overflow / cut-off or clipped buttons. Prime suspect: the
  TimerBar's five controls + session clock in one row at 320px.
- Tap targets under ~44px.
- Text truncation or unreadable wrapping.
- Content hidden behind the sticky TopBar or the fixed TimerBar / bottom nav
  (padding gaps).
- recharts not shrinking to its container.

### Method

Manual sweep + fix, no new test infra. Drive the app in the browser at each
width, screenshot each page and state, catalog every issue in a table
(page · width · problem), apply fixes, re-verify the same shots. Deliverable:
the issue catalog + before/after screenshots, all fixes applied.

### Out of scope

- iOS safe-area / notch insets (device-specific; can't verify in desktop
  Chrome). Flag obvious cases but don't chase.
- Landscape (app is portrait-locked).

---

## Sequencing

Part A and Part B are independent and can be implemented in either order. Part
A is small and self-contained; Part B is a longer iterative sweep. Suggest
landing Part A first as a clean, easily verified change, then the UI sweep.
