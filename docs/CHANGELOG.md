# Changelog — deploy ledger

Reverse-chronological record of what shipped and when. The **current** state,
runbook, and backlog live in [AGENTS.md](../AGENTS.md); this file is history.

## 2026-08-17 — Deployed `adbf3f5` (hardened `/api/import`)

Two defects on the disaster-recovery path, found by the profiles-migration
research (`docs/superpowers/research/2026-08-17-profiles-migration-blast-radius.md`)
before a real migration would have hit them silently:

- `restored` counts were read straight from the uploaded envelope, never the
  DB. Reproduced with a throwaway reorder of `TABLES` so a parent table
  followed its child (the shape a `profiles` table would add): the FK
  cascade wiped the just-inserted child rows, and the endpoint still
  reported them restored. Counts are now `SELECT COUNT(*)` after commit.
- The envelope gate required every *current* table to be present, so adding
  any table later would break every existing backup. It now only requires
  the tables that existed at the envelope's own `schema_version`
  (`TABLE_INTRODUCED_AT`).
- Bonus fix: `PRAGMA user_version` no longer rolls backward when restoring
  an older envelope — the physical schema is already at `cur_version` from
  startup migrations, so recording a lower version risked a non-idempotent
  future migration re-running against an already-migrated DB.

TDD throughout, `backend/test_foundations.py` (49 → 53 backend tests). Built
on the Mac for `linux/arm64`, transferred over LAN SSH, `compose up -d`.
Verified: root 200, `/api/health` `version` = `adbf3f5`, `homeassistant`
still `healthy`, live data intact (1 session / 17 sets / 297 events). No
schema change, so no migration and no restore drill; a pre-deploy
`/api/export` snapshot was still taken since the restore path itself was
what changed. Previous image (`9f3f237`) remains on the Pi untagged as
`8035631eefb5` for rollback. This was item 1 of
`docs/superpowers/backlog/2026-08-16-next-workstreams.md`'s sequencing — the
design-system decision (D) is next.

## 2026-08-17 — Deployed `9f3f237` (PWA picks up deploys on its own)

A deploy was invisible on the phone until the app was force-quit: the service
worker precaches the app shell, and a PWA resumed from the background never does
a fresh navigation, so `registerSW` never re-ran and `registerType: 'autoUpdate'`
had nothing to act on. The Pi was serving the new build the whole time.

`main.jsx` now registers the worker itself and requests an update check when the
document becomes visible (plus a 30-minute backstop). The check is gated on route
rather than the reload — `autoUpdate` reloads the moment it finds a new worker,
and on `/workout/:id` that would discard weight and reps typed but not yet logged.

Note the one-time chicken-and-egg: this logic ships *inside* the build, so one
final force-quit was needed to land on it. Subsequent deploys self-update.

## 2026-08-17 — Deployed `ff1eea4` (muscle-group picker + recovery estimate)

Built on the Mac for `linux/arm64`, transferred over SSH, `compose up -d`.
Verified: root 200, `/api/health` `version` = `ff1eea4`, `homeassistant` still
`healthy`. Confirmed against real data — `/api/exercises/recency` returns the
2026-07-08 Upper A session, Home reads "Last workout 40 days ago", the four
Upper-trained groups read `Fresh` and the three Lower groups `Not trained yet`.
No schema change, so no migration and no restore drill.

The 40-day gap was an accidental live test of the guardrails: no "losing gains"
nudge, no warning colour, no readiness language — just the neutral fact.

Previous image (`b63006f`) remains on the Pi untagged as `0a91727f1437` for
rollback.

## 2026-08-16 — Muscle-group picker + recovery estimate

Built directly on `main` as eight reviewable commits, each leaving both suites
green. Design:
`docs/superpowers/specs/2026-08-16-muscle-group-recovery-design.md`; evidence
review (16 primary sources):
`docs/superpowers/research/2026-08-16-recovery-science.md`.

- **Muscle-group picker on Home** (`af6c19e`, `1234e58`): seven display groups
  (Chest, Back, Shoulders, Arms, Quads, Hamstrings & Glutes, Calves) collapsed
  from the plan's 22 inconsistent raw muscle tags. Tapping a group expands it
  and offers the plan day that trains it most; the 4-day cycle stays the
  default entry point and advances normally from a picker-started day. Ties
  break toward the more rested day — verified live: Quads ties at 6 fractional
  sets between Lower A and Lower B, and the picker recommends Lower B when
  Lower A was trained 3 days ago.
- **Days since last workout**, both overall under the header and per group.
- **Recovery estimate** (`d4b9de0`): exponential stimulus decay from logged
  training only, rendered as a continuous animated ring plus a band label —
  `Fresh` / `Partly recovered (est.)` / `Recently trained` — and **never as a
  percentage**. Time constants key off movement pattern, not muscle size
  (Dourado 2023: knee extension 24 h vs leg press 48 h, same muscle, same
  subjects); indirect sets count 0.5 (Pelland 2025). Nothing fitted, no
  per-user parameters, no biometrics collected. The ring is a sequential
  encoding: single-hue emerald ramp, monotonic in lightness, no red/amber/green
  warning semantics, and the band label means colour is never the only channel.
- **Disclosure at the point of display**, not in settings: the estimate knows
  nothing about sleep, HRV, or unlogged classes. That blind spot is
  one-directional — it can only ever *overstate* freshness.
- **New endpoint `GET /api/exercises/recency`** (`32e61fb`): per-exercise
  last-trained date, timestamp, set count, volume and previous-session date, in
  one query, replacing a would-be 22-request fan-out on Home load. Read-only
  and additive: **no schema change, so no restore re-drill was required.**
- **Fix** (`8ae06b1`): `Workout.jsx` threw a `TypeError` on a session whose
  `workout_day` was not one of the four plan keys; the effect's own
  `.catch(() => nav('/'))` then swallowed it and bounced the user to Home,
  making the page's "Unknown workout day." fallback unreachable.
- **Fix** (`eeeb9a3`): muscle chips could widen their grid track past `1fr`
  (grid items default to `min-width: auto`).
- Verified at a real 320 px viewport over CDP: `scrollWidth == clientWidth`,
  zero overflowing elements, minimum chip height 62 px, no numeral anywhere in
  the rendered text. Tests: 49 backend (42 + 7), 135 frontend (62 + 73).

## 2026-07-10 — Responsive sweep (`feat/responsive-sweep`)

Plan Part B (2026-06-30) at full original scope: 124 headless-Chrome
screenshots — 8 portrait viewports (320→1024 wide + a 320×568 short pass) ×
11 page/states — each probed automatically for horizontal overflow and
sub-44 px tap targets. 13 catalogued defects, all fixed
(`docs/superpowers/audits/2026-06-30-responsive-catalog.md`):

- **TimerBar** (`9c19aa8`): the five rest controls overflowed ≤375 px (Skip
  fully off-screen at 320); static styles moved to classes with two compact
  media tiers (≤440/≤340) — every control on-screen and 44 px tall down to
  320 px, even with an H:MM:SS session clock. Also fixed the base bar having
  ~2 px slack at 430 px.
- **Set logger** (`57012a0`): Weight/Reps steppers now wrap below ~380 px —
  the Reps "+" button was off-screen at 320 px (reps could not be increased).
- **Toast** (`1f886bd`): long PR messages wrap instead of clipping
  (`width: max-content` + `max-width`; a fixed element at `left:50%`
  otherwise shrink-wraps to half the viewport).
- **Tap targets** (`37a1bf1`, `118e8f9`): new `.tap-target` class extends the
  clickable box to ≥44 px via a pseudo-element with zero layout change —
  banner discard ×/✓/✗ + resume row, Export my data, form-cues/add-note
  links, Exercise back buttons, Progress chips, Delete session. Verified
  functionally (click 18 px outside a 19 px-tall label still fires).
- **Cosmetics** (`53a60d6`): History duration wraps as a unit; chart date
  ticks clear the "0kg" y-label.

Tests 42 backend + 62 frontend (unchanged — CSS/layout-only wave). Deployed
to the Pi 2026-07-10 ~10:45 BST (`/api/health` version `3420458`), after
stabilizing an HA crash loop with a power-cycle — during which the PSU
under-voltage was confirmed live (`0x50005` on a fresh idle boot).

## 2026-07-09 — Version stamp (`4243f77`)

Git short SHA baked into the image (`--build-arg APP_COMMIT=...`): shown as a
muted `v <sha>` footer on Home and as `version` in `/api/health`. Deploy
verification is now "health version == HEAD short-SHA" (runbook updated).

## 2026-07-09 — Review-of-review fast-follow

Independent second-pass review of the review-fixes wave found 6 real issues,
all fixed same-day: Log Set button label matched count+1 while the POST used
max+1; the new jsDelivr SW rule cached opaque responses CacheFirst (quota-
padded ~7 MB each — could evict the whole origin cache; captive-portal pages
could be pinned as "demos" for 180 days) — now `crossorigin="anonymous"` on
the demo img + `statuses: [200]` only; failed imports skipped the snapshot
prune (now pruned at snapshot time); `/api/health` could 500 on a
non-standard imported `ts`; `/api/progress` listed picker chips whose charts
were permanently empty (now completed-only, mirroring `get_progress`); the
PR toast treated a legitimate 0 kg max as "no record". Plus: the five
copy-pasted backend test fixtures consolidated into `conftest.py`. Tests
40 backend + 61 frontend.

## 2026-07-09 — Review-fixes wave (`feat/review-fixes`)

Triple review (running app, Pi system, repo/docs) triaged via review board;
all 45 findings actioned. Highlights:

- **Backend** (`ca29b59`): removed wildcard CORS (any LAN page could read
  `/api/export` or fire `/api/import` cross-origin); `/api/progress/{id}` keeps
  the most *recent* 60 sessions (was oldest-60 — chart froze after ~8 months)
  and counts completed sessions only; `/api/progress` returns per-exercise
  `max_weight` (kills a 23-request fan-out on workout open); PR baselines
  (plan Part A): first-ever entries emit a muted `baseline`, not fake PRs;
  PATCH on missing session → 404 (was 500); `/api/health` GET+HEAD, no-store,
  and reports `stale` when the last ok-heartbeat is >26 h old; `/api/export`
  no-store; import snapshots use microsecond names and prune to newest 3;
  events batches capped at 100; `workout_day` whitelisted; compose sets
  `TZ=Europe/London` so post-midnight workouts keep the local date.
- **Frontend** (`bef5599`): wake-lock re-acquires after tab switches (was lost
  for the rest of the session); set numbers use max+1 (no duplicates after a
  mid-session delete); single Finish button; auto-advance scrolls the next
  exercise into view (reduced-motion aware); baseline entries render quietly
  in the finish summary; Inter + JetBrains Mono self-hosted as variable woff2
  (no Google Fonts request, offline-capable); demo frames (jsDelivr)
  CacheFirst-cached. Tests 60/60 (was 50), incl. new Workout page suite.
- **Ops/build** (`3ad9839`): backup.sh — staging moved off tmpfs to
  `~/backups`, in-container temp cleaned via trap, events-prune decoupled from
  the success chain, optional `HEARTBEAT_URL` (independent receiver) and
  `REMOTE_KEEP_DAYS`; `.dockerignore` + gcc removal → image 282 MB (was 572).
- **Pi (out-of-repo)**: pruned 4.1 GB (dangling images, watchtower, build
  cache; disk 71%→57%); Sunday HA cron now prunes after pull; audio/desktop
  user daemons masked (bluetoothd kept for HA); Pi Connect screen-sharing off
  (wayvnc was crash-looping); **restore drill passed** — Drive snapshot pulled
  and verified against live (schema v2, integrity ok, row counts match).

## 2026-07-09 — Backup chain live

rclone (static binary, `~/.local/bin` — no sudo on the Pi) authorized to
Google Drive, first snapshot in `gdrive:workout-tracker-backups`, heartbeat
verified, nightly cron installed (03:30 → `~/backup.log`). Ops commits
`d2e69a8`, `e27ea4d`.

## 2026-07-09 — v-next Phase 1: Foundations & Data Safety (deployed)

`ccc0ea2..13bd3b5`, 18 commits, merge `880c735`. Spec:
`docs/superpowers/specs/2026-07-08-vnext-phase1-foundations-data-safety-design.md`.

- DB hardening: contextmanager `db()`, WAL, `busy_timeout`, `foreign_keys=ON`,
  connection-leak fixes.
- `PRAGMA user_version` migration runner (v2: `events` table + 4 indexes;
  additive/idempotent, live-prod-shape regression-tested).
- pydantic `Field` validation (422 on bad writes).
- Usage analytics: `POST /api/events` batch, `GET /api/analytics/summary`,
  frontend `track()`/`flush()` + `ScreenTracker` + action events.
- Backup/restore: `GET /api/export`, guarded atomic `POST /api/import` (with
  pre-import snapshot + column allowlist), `scripts/backup.sh` (container-exec
  VACUUM INTO → rclone → heartbeat), `/api/health` surfaces
  `last_backup_at/status`, "Export my data" link on Home, SW never caches
  `/api/export`.
- Deployed on-LAN (image `save|ssh|load`): live migration v0→v2 with real rows
  intact, bundle `index-DdLwN__4.js` verified, HA healthy. Note: the spec's
  host-sqlite3 backup (Layer B) was superseded by container-exec (`13bd3b5`) —
  the container's root-owned WAL sidecars can't be read by the host cron user.

## 2026-06-30 — Resume in-progress session (deployed off-LAN)

`4bd1355`: global `ResumeBanner` + `ActiveSession` context — link back to a
live session from any page, Home resumes instead of duplicating, discard and
finish clear the active state. Deployed via Raspberry Pi Connect + release
asset `deploy-20260630-4bd1355`; bundle `index-CXVPjZZ7.js` verified.
Spec/plan: `docs/superpowers/{specs,plans}/2026-06-30-resume-in-progress-session*`.

## 2026-06-30 — Sticky top bar + stable timer (deployed off-LAN)

`8405eb1` (sticky bar, fixed-height timer) + `74e5e54` (tracked
`workoutPlan.js`), release asset `deploy-20260630`; bundle
`index-DnoJc6xD.js` verified.

## 2026-06-28/29 — Feature waves (all deployed)

- **Workout intelligence**: `exercise_notes` table + notes endpoints,
  `GET /api/exercises/{id}/last`, `GET /api/sessions/{id}/prs` (weight /
  reps@weight / Epley 1RM / session volume), previous-performance panel,
  deterministic overload hint, weight prefill, editable notes, rest-timer
  pause + remembered duration, loading skeletons.
- **UX pass**: Screen Wake Lock, non-blocking toasts, inline two-tap delete,
  vibration at rest 0, big REST/GO countdown, WCAG-AA contrast, ≥44px tap
  targets, `prefers-reduced-motion`, faster logging loop.
- **Workout timer**: sticky session clock + 90s rest countdown auto-started
  per set (±30s / Skip, beep + flash), timestamp-derived (iOS-safe).
- **Session tracking**: `sessions.ended_at` (idempotent migration), finish
  summary (duration/sets/volume/exercises/PRs), per-session duration in History.
- **Inline exercise demos**: keyless `resolve-demos.mjs` → committed
  `exerciseDemos.json` (yuhonas/free-exercise-db, CC0, jsDelivr frames);
  two-frame animation with YouTube fallback.
- **PWA**: installable (manifest + icons), `autoUpdate` SW, offline-read
  (NetworkFirst `GET /api/*`), `navigateFallback`.
- **Tests**: Vitest (frontend) + pytest (backend) introduced.

## 2026-06-27 — Containerised & first Pi deploy

Multi-stage arm64 image built on the Mac, moved via `save|ssh|load` (registry
removed; `pull_policy: never`, no `build:` key). Runs alongside Home Assistant
(healthy) + Tailscale; reachable on LAN `:8080` and tailnet
`100.64.119.1:8080`. `requirements.txt` pinned (fastapi 0.138 / uvicorn 0.49 /
pydantic 2.13.4), validated in-container on `python:3.11-slim`.
`.gitignore` `data/` anchored to `/data/` so `frontend/src/data/` is tracked.
