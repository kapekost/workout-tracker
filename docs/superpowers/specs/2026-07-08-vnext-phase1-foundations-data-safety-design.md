# v-next Phase 1 — Foundations & Data Safety — Design

**Date:** 2026-07-08
**Status:** Approved (pending implementation plan)

## Context — the v-next roadmap

This is **Phase 1 of 5** in a planned "v-next" effort. The phases are
independently spec'd, planned, built, reviewed, and deployed one at a time so
the live app is never destabilised:

1. **Foundations & data safety** — *this doc*. Backup, DB hardening, input
   validation, migration versioning, usage analytics.
2. Gym-floor UX — rest-timer sound, more readable advice, demo/cues surfaced in
   the logger (GIF higher).
3. Warmup sets — `is_warmup` flag + mandatory stats-query filter + auto-ramp UI.
4. Personal-best import — seed baselines from previous apps; new Settings tab.
5. AI trainer — Claude-backed coach (server-side), provider-agnostic, degrades
   to the existing deterministic overload engine when no API budget.

Every phase ends with the same gate: full test suite green → `/code-review` →
progress report appended to `AGENTS.md` → build → transfer → verify on the Pi.

## Problem

The app is **live** with real workout data, yet:

- There is **no backup**. The SQLite DB lives on a Raspberry Pi SD card
  (`~/workout-tracker/data/workouts.db`); one card failure loses everything
  (flagged in `AGENTS.md` → "Data persistence & backup").
- `db()` (`backend/main.py:14-18`) opens a bare connection: no WAL, no
  `busy_timeout`, no `foreign_keys=ON`, so the declared `ON DELETE CASCADE`
  (`main.py:39`) is inert, and several handlers leak connections on the 404 path
  (`get_session` `main.py:94`, `add_set` `main.py:123`).
- Write payloads are unvalidated (`SetIn` `main.py:58-63`): negative/zero weight
  and reps silently corrupt PR/volume math.
- Migrations are ad-hoc `PRAGMA table_info` checks (`main.py:47-49`) — fragile as
  new tables land.
- There is **no usage data**, so v-next decisions can't be driven by how the app
  is actually used.

## Goals

- Protect the live data: on-demand export + automated off-site backup.
- Harden the DB (durability + integrity) without changing app behaviour.
- Validate writes so bad input is rejected, not silently stored.
- A lightweight, versioned, additive-only migration mechanism for all future
  phases.
- Begin collecting self-hosted usage analytics (screens + actions + timings).

## Non-goals (YAGNI)

- No `POST /api/import` / restore endpoint yet — JSON export + a documented
  manual restore path is enough for Phase 1 (restore is rare, manual, and can be
  built when first needed).
- No analytics **UI/dashboard** — a query endpoint is enough; a dashboard is a
  later, data-informed decision.
- No third-party analytics SaaS. Single-user, self-hosted only.
- No changes to any user-facing workout behaviour.
- No heavyweight infra (no Postgres, no message queue). SQLite + one container.

## Hard constraint — data safety

The app is LIVE. **Every schema change is additive and idempotent**: new tables,
new indexes, new columns with defaults only. No existing column is altered and no
existing row is rewritten. Running `init()` against the current production DB
must preserve every row. A migration-idempotency test enforces this.

## Architecture

Backend-centric. Five independent units, each separately testable.

### 1. DB connection hardening (A2) — `backend/main.py`

Refactor `db()` into a `contextlib.contextmanager` (or a FastAPI dependency)
used with `with db() as conn:` / `try/finally`, so every handler closes its
connection even when it raises `HTTPException`. This fixes the leaks in
`get_session` and `add_set`.

Per-connection PRAGMAs, set once per connection in `db()`:

- `PRAGMA journal_mode=WAL` — crash-durable; lets the analytics ingest write
  while reads happen.
- `PRAGMA busy_timeout=5000` — avoids spurious "database is locked" under WAL.
- `PRAGMA foreign_keys=ON` — makes the existing `ON DELETE CASCADE` real.

WAL adds `-wal` / `-shm` sidecar files; the backup path (unit 4) uses
`VACUUM INTO`, which produces a single consistent file and needs no manual
checkpoint.

### 2. Migration runner (A4) — `backend/main.py` `init()`

Replace the ad-hoc column checks with an ordered runner keyed on
`PRAGMA user_version`:

```
MIGRATIONS = [
  # (version, sql-or-callable) applied in order when user_version < version
]
```

- `user_version == 0` on the current production DB. Migration steps bring the
  schema forward; each is guarded (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN` behind a `table_info` check) so re-running is a no-op.
- After the last step, `PRAGMA user_version = <n>`.
- The existing baseline schema (sessions, sets, exercise_notes, `ended_at`
  column) is represented as the version-0 baseline / early steps so a fresh DB
  and the live DB converge to the same schema.

New objects introduced by this phase (all additive):

- `events` table (unit 5).
- Indexes: `sets(session_id)`, `sets(exercise_id)`, `events(ts)`, `events(name)`.

### 3. Input validation (A3) — `backend/main.py` Pydantic models

Add `Field` constraints:

- `SetIn`: `reps: int = Field(ge=1)`, `weight_kg: float = Field(ge=0, le=1000)`,
  `set_number: int = Field(ge=1)`, `exercise_name`/`exercise_id`
  `Field(max_length=…)`.
- `SessionIn` / `NoteIn`: `max_length` on free-text fields.

Invalid input yields FastAPI's default `422`. Covered by pytest.

### 4. Backup (A1)

**Layer A — on-demand export.** `GET /api/export` returns a consistent JSON
snapshot of all tables (`sessions`, `sets`, `exercise_notes`, `events`) with a
top-level `{ "exported_at", "schema_version", "tables": {…} }` envelope.
Read-only, streams from a single connection. Tappable from the phone; the file
leaving the Pi is what makes it durable.

**Layer B — automated off-site copy.** `scripts/backup.sh`, run on the Pi
**host** via cron (never in the container, so it can't trigger a build):

1. `sqlite3 workouts.db "VACUUM INTO '/tmp/workout-YYYYMMDD-HHMM.db'"` — a
   consistent copy of the live DB (safe under WAL; `cp` is not).
2. `rclone copy` the file to a Google Drive remote.
3. Prune local temp copies older than 14 days.

The rclone remote auth + `crontab` entry are a one-time host setup, documented as
a runbook step in `AGENTS.md` (`docs/superpowers` note + AGENTS Status). The
script is committed; the secrets (rclone token) live only on the Pi host, never
in the repo or image.

**Restore (manual, documented):** stop the container, drop a backup `.db` into
`data/workouts.db` (or re-import the JSON via a future endpoint), restart.
Documented in `AGENTS.md`; no code this phase.

### 5. Usage analytics (B7 — screens + actions + timings)

**Schema** (additive migration):

```
events(
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,          -- e.g. 'screen_view', 'set_logged'
  screen  TEXT,                   -- current screen/route, nullable
  props   TEXT,                   -- small JSON blob, nullable
  ts      TEXT NOT NULL DEFAULT (datetime('now'))   -- UTC
)
```

Indexes on `events(ts)` and `events(name)`. Retention: the backup cron prunes
rows older than 12 months (`DELETE FROM events WHERE ts < …`). Timestamps are
UTC (`datetime('now')`), aligning with `logged_at`/`created_at`; the pre-existing
local-time `sessions.date` (`main.py:79`) is out of scope here.

**Ingest:** `POST /api/events` accepts a **batch** — a JSON array of
`{name, screen?, props?}` — inserts all rows in one transaction, returns `204`.
No auth (single-user LAN app). Malformed items are rejected (validation, unit 3
style).

**Read:** `GET /api/analytics/summary?days=N` returns counts grouped by `name`
and by `screen` over the last N days (default 30). Enough to answer "what do I
actually use"; no dashboard UI this phase.

**Frontend — `frontend/src/lib/analytics.js`:** a `track(name, props)` helper:

- In-memory queue; **fire-and-forget**, never blocks or throws into the UI.
- Flush on a short interval **and** on `visibilitychange`→hidden /
  `pagehide` (so events survive backgrounding the PWA), via `POST /api/events`
  (batch). Uses `navigator.sendBeacon` when available on unload, else `fetch`.
- Silently drops events if the network fails (analytics is best-effort).

**Instrumentation points:**

| Event | Where |
|---|---|
| `screen_view` | route change (Home/Workout/Exercise/History/Progress) |
| `time_on_screen` (ms, props) | on leaving a screen |
| `session_start` | Home `startWorkout` |
| `session_finish` (+ duration) | Workout Finish |
| `set_logged` | Workout `logSet` |
| `rest_skip`, `rest_adjust` | `TimerBar` controls |
| `rest_actual_vs_target` (props) | rest end / skip |
| `demo_view` | Exercise demo shown |
| `cues_open` | Form-cues opened |
| `note_edit` | note saved |
| `set_delete`, `session_delete` | delete actions |

**Privacy:** single user, self-hosted, no PII, no third party — no consent flow
needed.

## Data flow summary

| Event | Action | Result |
|---|---|---|
| App startup | `init()` runs versioned migrations | schema forward, existing rows intact |
| Any write (set/session/note) | Pydantic validates → insert | bad input → `422` |
| User taps Export | `GET /api/export` | JSON snapshot downloaded to phone |
| Nightly (Pi host cron) | `backup.sh`: VACUUM INTO → rclone → prune | off-site copy on Google Drive |
| User uses the app | `track()` queues → batched `POST /api/events` | rows in `events` |
| Review usage | `GET /api/analytics/summary` | counts by name/screen |

## Edge cases

- **Idempotent init on live DB:** migrations detect already-applied state via
  `user_version` and `IF NOT EXISTS`; running twice changes nothing.
- **WAL sidecar files:** `VACUUM INTO` yields one consistent file; backup never
  copies a torn `-wal`.
- **Analytics network failure:** events are dropped, UI unaffected — never a
  hard dependency.
- **Batch with one bad event:** the request is rejected (422) so the client
  re-queues valid ones on next flush; ingest stays all-or-nothing per request.
- **Empty `events` table:** `analytics/summary` returns empty groups, not an
  error.

## Testing (TDD)

- **pytest (backend):**
  - Validation: negative/zero weight, reps < 1, oversized strings → `422`; valid
    payloads → `200/201`.
  - `GET /api/export`: envelope shape, all tables present, row counts match.
  - `POST /api/events`: batch insert, `204`, rows persisted; malformed batch →
    `422`.
  - `GET /api/analytics/summary`: correct grouped counts over a window.
  - **Migration idempotency:** run `init()` twice on a temp DB → no error, schema
    stable, `user_version` correct; seeded rows survive.
  - Regression: existing session/set/notes/PR endpoints still pass.
- **Vitest (frontend):**
  - `analytics.js`: `track()` queues; flush batches and POSTs; flush on
    `visibilitychange`/`pagehide`; a failing POST doesn't throw.
- **Not unit-tested:** `scripts/backup.sh` (host/cron/rclone) — validated
  manually during the one-time Pi setup and documented in `AGENTS.md`.

## Deploy gate

Full pytest + Vitest green → `/code-review` → append progress report to
`AGENTS.md` Status → build (Mac, arm64) → transfer to Pi → verify (`/api/health`
ok, bundle hash matches, Home Assistant still healthy). One-time: run the rclone
+ crontab setup on the Pi host and confirm the first nightly backup lands in
Google Drive.
