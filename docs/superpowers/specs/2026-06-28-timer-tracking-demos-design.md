# Design: Workout Timer, Session Tracking & Inline Exercise Demos

_Date: 2026-06-28_

## Summary

Three enhancements to the gym tracker PWA, combined into one spec:

1. **Workout timer** — a rest countdown + session clock during an active workout.
2. **Session tracking** — capture workout duration and show a finish summary.
3. **Inline exercise demos** — replace the YouTube-search link with a looping
   animation per exercise, sourced from ExerciseDB at build time.

All three are buildable within the existing architecture (React/Vite PWA +
FastAPI/SQLite, one container, Mac-build → Pi deploy). No native code, no Apple
HealthKit (ruled out — a PWA cannot access HealthKit), no new runtime services.

## Context / constraints

- App is a **PWA**, not a native iOS app. Apple Workout / Apple Watch / HealthKit
  integration is **out of scope** — there is no web API for it.
- Pi has ~1 GB RAM; keep additions lightweight. Image is built on the Mac only.
- Current state:
  - `sessions` table has `created_at` (timestamp) + `completed` flag, but **no
    end timestamp**. `sets` have `logged_at`.
  - No timer exists anywhere.
  - "Demo" today is a button (`Exercise.jsx:83`) opening a **YouTube search
    results** page via `ytUrl` in `workoutPlan.js` — the user must still pick a
    video.

---

## Feature 1 — Workout timer

A sticky bar pinned above the nav on the Workout page during an active session.

### Components
- **Session clock (counts up):** elapsed time since the workout started. Derived
  from the session's existing `created_at`; **no schema change**.
- **Rest timer (counts down):** **auto-starts when "Log Set" is tapped.** Default
  **90s**. Controls: `−30s`, `+30s`, and `Skip`. On reaching 0: an audio beep +
  the bar flashes.

### Behavior / implementation notes
- Rest timer is computed from a **stored start timestamp** (remaining =
  target − (now − start)), so iOS background-tab throttling never produces a
  wrong number — it's correct the moment the user looks.
- The rest timer is **client-only, ephemeral** (React state on the Workout page).
  Not persisted; leaving the page ends it. (YAGNI for v1.)
- **iOS limits (accepted, not choices):**
  - Vibration API is unsupported on iOS Safari/PWA → no haptic buzz.
  - The "done" alert (beep + flash) fires reliably only while the app is in the
    **foreground**. Background notifications are out of scope for v1.

### Rejected alternatives
- Inline per-exercise timer (lost when scrolling).
- Top-header timer (collides with existing session header).
- Sticky bottom bar chosen — standard mobile pattern, always visible.

---

## Feature 2 — Session tracking

### Backend
- Add one column: `ALTER TABLE sessions ADD COLUMN ended_at TEXT` (guarded so
  existing DBs upgrade cleanly on startup).
- Set `ended_at = datetime('now')` when a session is PATCHed to `completed = true`.
- Include `ended_at` in session responses. Duration = `ended_at − created_at`.

### Frontend
- **Finish summary:** tapping "Finish" shows a summary card before returning Home:
  **duration, total sets, total volume (Σ weight×reps), exercises completed, and
  any PRs hit this session.** Then a "Done → Home" button.
- **History page:** show **duration** alongside each past session.

---

## Feature 3 — Inline exercise demos (ExerciseDB, build-time)

### Data layer
- New build-time script `frontend/scripts/resolve-demos.mjs`:
  - Reads the exercise list from `workoutPlan.js`.
  - Queries **ExerciseDB** (RapidAPI; key from `RAPIDAPI_KEY` env var on the Mac —
    **never committed, never shipped to the client**).
  - For each exercise, finds the best match (with a small in-script
    `name → query` override map for names that won't auto-match, e.g.
    "Bent-over Row") and extracts its `gifUrl`.
  - Writes `frontend/src/data/exerciseDemos.json` mapping
    `exercise_id → gifUrl`.
- `exerciseDemos.json` is **committed**. Normal builds/deploys need no API key and
  no network; the script only re-runs when exercises are added/swapped.

### UI layer (`Exercise.jsx`)
- Replace the YouTube-search button with a looping demo (`<img>`/`<video>` of the
  GIF): rounded card, exercise accent color, lazy-loaded.
- **Graceful fallback:** if an exercise has no resolved demo, or the image fails
  to load, fall back to the existing YouTube-search link. Nothing ever appears
  broken; uncovered exercises still work.
- The Workout page "📋 Form cues + demo →" link is unchanged.

### Tradeoffs (accepted)
- GIFs load from ExerciseDB's CDN at runtime → requires phone data at the gym
  (fine on cellular) and is **not** offline-cached.
- ExerciseDB has changed/broken hotlink URLs before, and the free RapidAPI tier
  is rate-limited; if their CDN changes, demos may need re-resolving. This is the
  reliability cost of choosing an external source over self-hosting.

### Rejected alternatives
- Self-hosted clips (offline-capable but requires sourcing/hosting ~16 files).
- Runtime backend proxy (adds a live dependency + Pi load).
- Generic GIF sites (Giphy/Tenor) — not curated for correct lifting form.

---

## Out of scope
- Apple HealthKit / Apple Watch / Apple Fitness integration.
- Apple Shortcut-based Health export (considered, dropped).
- Persisting the rest timer across navigation/refresh.
- Background/locked-screen rest notifications.
- Per-exercise custom rest defaults (global 90s for v1).

## Deploy impact
- Feature 1: client-only.
- Feature 2: one additive SQLite column + one new response field.
- Feature 3: one dev-only build script + one committed JSON; GIFs from external CDN.
- No new runtime dependencies. Mac-build → Pi deploy model unchanged.

## Testing
- Timer: rest countdown math from timestamp (incl. simulated throttling gap),
  auto-start on log, ±30s/skip, beep+flash at 0.
- Tracking: `ended_at` set on completion; duration computed correctly; summary
  totals (sets, volume, PRs) match logged sets; History shows duration.
- Demos: resolve script produces a valid map; UI renders demo when present and
  falls back to YouTube link when absent or on image error.
