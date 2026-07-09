# Resume in-progress workout session — Design

**Date:** 2026-06-30
**Status:** Implemented & deployed 2026-06-30 — see docs/CHANGELOG.md

## Problem

Starting a workout creates a session (`completed = 0`) and navigates to
`/workout/:sessionId`. A session only becomes `completed = 1` when the user taps
**Finish**. The bottom `NavBar` (Home / Progress / History) lets the user leave
that URL at any time, and nothing anywhere links back. The session is still live
on the backend, but the in-progress URL is effectively lost — there is no path to
resume logging an in-progress session.

A secondary consequence: because nothing auto-completes a session, pressing
**Start** on Home always creates a *new* session, so abandoned in-progress
sessions can pile up.

## Goals

- From **any** page, provide a visible path back to an in-progress session.
- Prevent duplicate in-progress sessions: when one is active, Home offers
  **Resume** instead of **Start**.
- Provide a way to **discard** an abandoned session so Start is available again.

## Non-goals (YAGNI)

- No backend changes. `GET /api/sessions` already exposes `completed`, and
  `DELETE /api/sessions/{id}` already cascades to the session's sets.
- No automatic expiry of stale sessions — explicit discard handles cleanup.
- No multi-session management UI. Legacy data with several incomplete sessions
  resolves to "most recent"; the user discards them one at a time.

## Architecture

Entirely frontend. One shared source of truth for "is there an active
(incomplete) session," consumed by a global banner and by Home.

### 1. `ActiveSessionProvider` — new, `src/lib/activeSession.jsx`

A React context provider wrapping the app **inside** `BrowserRouter`. State:

- `active` — the most-recent session with `completed == 0`, or `null`.

API exposed via context:

- `active` — the session object (or `null`).
- `refresh()` — re-fetch `GET /api/sessions` and recompute `active`.
- `discard(id)` — `DELETE /api/sessions/:id`, then `refresh()`.

Selecting the active session is a tiny pure function:

```
findActiveSession(sessions) -> session | null
```

Given the list (already ordered `created_at DESC` by the API), return the first
entry with a falsy `completed`, else `null`. Unit-tested in isolation.

The provider fetches once on mount. Pages call `refresh()` at the three
state-change points:

- **Create** — Home `startWorkout`, after `POST /sessions`, before navigating.
- **Finish** — Workout, after `PATCH /sessions/:id { completed: true }` succeeds.
- **Discard** — handled inside `discard()` itself (banner trigger).

The provider stays focused on `active` only. Home keeps its own `/sessions`
fetch for next-up logic; the small duplicate fetch is accepted to limit
coupling.

### 2. `ResumeBanner` — new, `src/components/ResumeBanner.jsx`

Rendered directly under `TopBar`, sticky so it persists across page navigation.

Behavior:

- Renders **nothing** when `active` is `null`, **or** when the current pathname
  is `/workout/:activeId` (already on that session's page).
- Content: a day-colored dot + `{emoji} {Day} in progress` + `Resume ›`.
  Tapping the bar navigates to `/workout/:activeId`.
- A `×` on the right opens an **inline two-state confirm** (`×` → `Discard?`
  with ✓ / ✗) — no native `confirm()` dialog. Confirming calls
  `discard(active.id)`.
- Day color and emoji come from `DAY_COLORS` / `PLAN` keyed by
  `active.workout_day`. Guard for a `workout_day` missing from `PLAN`
  (generic label, neutral color, no crash).

### 3. `Home` changes

Consumes the context.

- When `active` exists: the hero reflects the **active** session — its day name,
  an `IN PROGRESS` tag, and its exercise preview (from `PLAN[active.workout_day]`).
  The primary button becomes **`Resume {name}`** and navigates to
  `/workout/:activeId`. The Start-a-new-workout flow is not shown.
- When `active` is `null`: current behavior unchanged ("Next up" + Start).
- `startWorkout` calls `refresh()` after the `POST` succeeds, before `nav(...)`.

### 4. `Workout` changes

After a successful **Finish** (`PATCH /sessions/:id { completed: true }`), call
`refresh()` so the banner clears and Home reverts to Start. Discard is owned by
the banner, not this page.

### 5. App wiring — `src/App.jsx`

Wrap the routed content in `<ActiveSessionProvider>` inside `<BrowserRouter>`,
and render `<ResumeBanner />` directly after `<TopBar />`.

## Data flow summary

| Event                         | Action                                  | Result                       |
|-------------------------------|-----------------------------------------|------------------------------|
| App mount                     | provider fetches `/sessions`            | `active` set if any incomplete |
| Home "Start" (no active)      | `POST /sessions` → `refresh()` → nav    | `active` = new session       |
| Navigate away from workout    | (nothing)                               | banner appears on every page |
| Tap banner / Home "Resume"    | `nav('/workout/:activeId')`             | back in the session          |
| Workout "Finish"              | `PATCH completed` → `refresh()`         | `active` = null, banner gone |
| Banner "× → Discard?"         | `DELETE /sessions/:id` → `refresh()`    | `active` = null, banner gone |

## Edge cases

- **Multiple legacy incomplete sessions:** banner/Home target the most recent;
  resume goes there; discard removes one at a time.
- **`workout_day` not in `PLAN`:** banner renders a generic label and neutral
  color; no crash.
- **Already on the active session's page:** banner hidden to avoid a redundant
  "Resume" pointing at the current view.

## Testing (TDD)

- **Unit:** `findActiveSession(sessions)` — empty list, all completed, one
  incomplete, multiple incomplete (returns most recent).
- **Component (React Testing Library; harness already present, cf.
  `History.test.jsx`):**
  - `ResumeBanner` renders when `active` is set; hides when `null`; hides on
    `/workout/:activeId`.
  - Discard flow: `×` reveals confirm; ✓ calls `discard`; ✗ cancels.
  - `Home` shows **Resume** when `active` exists, **Start** otherwise.
