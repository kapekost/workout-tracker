# AGENTS.md — workout-tracker

Guidance for AI agents (and humans) working on this repo. Read this fully before
making changes or deploying. Keep the **Status** section at the bottom current.

## What this is

A mobile-first gym tracker: logs sets/reps/weight, tracks progress, shows form
cues for a 4-day Upper/Lower split.

- **Backend**: Python FastAPI + SQLite. Serves the built frontend as static files
  and the JSON API from one process (`uvicorn main:app` on `:8000` inside the
  container).
- **Frontend**: React + Vite + Tailwind + Recharts. Built to static assets at
  image-build time and copied into the backend image (`/app/static`).
- **Packaging**: a single multi-stage Docker image. One container, nothing else.
- **Data**: SQLite file at `/app/data/workouts.db`, persisted via the `./data`
  volume. Never commit the DB; `data/` is gitignored.

## Where it runs

| Thing | Value |
|---|---|
| Dev repo (Mac) | `~/dev/workout-tracker` (Apple Silicon, `arm64`) |
| GitHub | `github.com/kapekost/workout-tracker` (private) |
| Pi host | `rpi-home` — `192.168.1.170`, user `kapekost`, SSH key `~/.ssh/id_raspi` |
| Pi arch / RAM | `aarch64` (arm64), **~1 GB RAM** — this constraint drives everything below |
| Pi repo clone | `~/workout-tracker` (read-only deploy key `id_workout_tracker` for `git pull`) |
| App URL (LAN) | `http://192.168.1.170:8080` |
| App URL (gym) | `http://100.64.119.1:8080` — Pi's Tailscale IP (Tailscale runs in **host** network mode) |
| Co-tenants on Pi | `homeassistant` + `tailscale` containers. **Do not disrupt them.** |

## Hard rules — do not violate

1. **NEVER build the image on the Pi.** A 1 GB Pi cannot compile the Vite
   frontend without exhausting RAM and thrashing swap (load spiked to ~20 and
   starved Home Assistant). Builds happen **only** on the Mac.
2. **No registry.** Images move Mac → Pi directly over SSH (`docker save | ssh |
   docker load`). Docker Hub / GHCR are intentionally not used.
3. **`docker-compose.yml` has no `build:` key and uses `pull_policy: never`.**
   This guarantees a missing image errors out instead of silently triggering an
   on-device build or a registry pull. Keep it that way.
4. **Host port is `8080`** (`8080:8000`). Port 80 is avoided so it can't collide
   with anything alongside Home Assistant.
5. **Protect the co-tenants.** Anything that touches the Pi must leave
   `homeassistant` (must stay `healthy`) and `tailscale` running. Prefer
   targeted, non-`sudo` Docker commands over host-wide actions or reboots.
6. **Data lives in the `./data` volume.** Never bake it into the image; never
   commit it.

## Runbook

### Build (Mac)
```bash
cd ~/dev/workout-tracker
docker buildx build --platform linux/arm64 -t kapekost/workout-tracker:latest --load .
```

### Transfer to the Pi (no registry)
```bash
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@192.168.1.170 'gunzip | docker load'
```

### Run / update (Pi)
```bash
ssh kapekost@192.168.1.170
cd ~/workout-tracker
git pull            # only needed when docker-compose.yml changed
docker compose up -d   # uses the loaded image; never builds, never pulls
```

### Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.1.170:8080/   # expect 200
ssh kapekost@192.168.1.170 'docker compose -f ~/workout-tracker/docker-compose.yml ps; \
  docker ps --format "{{.Names}} {{.Status}}" | grep homeassistant'    # HA still healthy
```

### Deploy off the home LAN (Raspberry Pi Connect — no SSH)
SSH (22) isn't reachable over Tailscale (the Pi is view-only on `:8080`), and
Raspberry Pi Connect is a **browser shell only** — no SSH/`scp`/pipe. So when
off-LAN, transfer the image as a **GitHub release asset** the Pi pulls over
HTTPS. The no-registry design is preserved: it's a file artifact, compose still
loads a local image (`pull_policy: never`). The built image is just compiled
public code on stock base images — no secrets/DB baked in — so a public asset
is safe.

On the Mac (build first, as above):
```bash
DATE=$(date +%Y%m%d); HEAD=$(git rev-parse --short HEAD)
docker save kapekost/workout-tracker:latest | gzip > /tmp/workout-tracker-$DATE.tar.gz
gh release create "deploy-$DATE" /tmp/workout-tracker-$DATE.tar.gz \
  -t "Deploy image $DATE ($HEAD)" -n "arm64 image, commit $HEAD"
gh release view "deploy-$DATE" --json assets -q '.assets[].url'   # asset URL
```
In the Pi's Connect browser shell (connect.raspberrypi.com → Pi → shell):
```bash
cd ~/workout-tracker && git pull && \
  curl -L <asset-url> | gunzip | docker load && docker compose up -d
docker image prune -f   # optional: drop the old image
```
Verify from anywhere on the tailnet (read-only `:8080`): `curl -s
http://100.64.119.1:8080/api/health` → `{"status":"ok"}`, and the live
`/assets/index-*.js` hash matches the just-built `frontend/dist` bundle
(Vite content-hashes, so equal filename = byte-identical build).

### Typical change loop
Edit code on the Mac → commit & push → **Build** → **Transfer** → **Run/update** on
the Pi → **Verify**. The git push keeps source history; the image transfer is what
actually updates the running app. On-LAN use `save | ssh | load`; off-LAN use the
release-asset path above.

## Gotchas learned the hard way

- `sudo` over a non-interactive SSH session hangs waiting for a password. Avoid it;
  the `kapekost` user is in the `docker` group, so `docker ...` needs no `sudo`.
- The `tailscale` CLI is **not** on the Pi host — it's inside the `tailscale`
  container: `docker exec tailscale tailscale ip -4`.
- The running app footprint is tiny (~12 MiB RAM, <1% CPU). If the Pi is ever
  thrashing again, something is **building** — stop it; never build here.

## Status

_Last updated: 2026-07-09._

**Pending deploy → Pi:** none. Backup chain fully operational as of 2026-07-09:
rclone (static binary, `~/.local/bin` — no sudo on the Pi) authorized to the
user's Google Drive, first snapshot landed in `gdrive:workout-tracker-backups`,
heartbeat verified (`/api/health` → `last_backup_status: "ok"`), nightly cron
installed (03:30, logs to `~/backup.log`).
NOTE: rclone warns its shared Google client_id is retired during 2026 — create
our own client_id before it breaks (https://rclone.org/drive/#making-your-own-client-id).

**Planned (spec + plan written, NOT yet implemented)**
- Personal-best baseline fix + responsive UI audit. Spec:
  `docs/superpowers/specs/2026-06-30-responsive-audit-pr-baseline-design.md`;
  plan: `docs/superpowers/plans/2026-06-30-responsive-audit-pr-baseline.md`.

**Done**
- **v-next Phase 1 — Foundations & Data Safety** (`ccc0ea2..13bd3b5`, 18 commits,
  spec `docs/superpowers/specs/2026-07-08-vnext-phase1-foundations-data-safety-design.md`):
  DB hardening (contextmanager `db()`, WAL, `busy_timeout`, `foreign_keys=ON`, conn-leak
  fixes), `PRAGMA user_version` migration runner (v2: `events` table + 4 indexes;
  additive/idempotent, live-prod-shape regression-tested), pydantic `Field` validation
  (422 on bad writes), usage analytics (`POST /api/events` batch, `GET
  /api/analytics/summary`, frontend `track()`/`flush()` + `ScreenTracker` + action
  events), backup/restore (`GET /api/export`, guarded atomic `POST /api/import` with
  pre-import snapshot + column allowlist, `scripts/backup.sh` container-exec VACUUM →
  rclone → heartbeat, `/api/health` surfaces `last_backup_at/status`), "Export my data"
  link on Home (SW never caches `/api/export`). Tests: backend 21/21, frontend 50/50,
  build clean. Per-task + final whole-branch review (fix wave `13bd3b5`) — APPROVED.
  **Deployed to the Pi on-LAN 2026-07-09** (image built on Mac, `save|ssh|load`):
  verified `/api/health` ok, live migration v0→v2 with real rows intact
  (schema_version 2; sessions/sets preserved), served bundle `index-DdLwN__4.js`
  matches the built image, Home Assistant healthy. Pre-deploy safety snapshot
  taken (`data/pre-phase1-deploy.db` on the Pi). Container-exec backup mechanics
  (VACUUM INTO → docker cp) validated on the Pi; only rclone install/auth + cron
  remain (manual, one-time).
- `4bd1355` (resume in-progress workout session: global `ResumeBanner` +
  `ActiveSession` context — link back to a live session from any page, Home
  resumes instead of starting a duplicate, discard/finish clear the active
  state) **deployed to the Pi off-LAN** via Raspberry Pi Connect + GitHub
  release asset `deploy-20260630-4bd1355`. Verified live: `/api/health` ok and
  the served `index-CXVPjZZ7.js` bundle hash matches the just-built image.
  Spec/plan: `docs/superpowers/{specs,plans}/2026-06-30-resume-in-progress-session*`.
- `8405eb1` (sticky top bar + fixed-height "stable" timer) + `74e5e54` (tracked
  `workoutPlan.js`) **deployed to the Pi off-LAN** via Raspberry Pi Connect +
  GitHub release asset `deploy-20260630`. Verified live: `/api/health` ok and the
  served `index-DnoJc6xD.js` bundle hash matches the just-built `frontend/dist`.
- App containerised; image builds on Mac (`arm64`), transfers to Pi via `save|load`.
- Deployed and verified on the Pi: `HTTP 200`, serving `Gym Tracker`, ~12 MiB RAM.
- Runs alongside Home Assistant (healthy) + Tailscale; reachable on LAN `:8080`
  and over Tailscale at `100.64.119.1:8080`.
- Registry-free: Docker Hub repo removed; `pull_policy: never`, no `build:` key.
- **PWA**: installable (manifest + barbell icon + apple-touch-icon), `autoUpdate`
  service worker, offline-read (NetworkFirst cache of `GET /api/*`),
  `navigateFallback` to `index.html`. Verified served with correct MIME types.
- **Workout timer**: sticky bar with session clock (counts up from `created_at`)
  + 90s rest countdown that auto-starts on each logged set (±30s / Skip, beep +
  flash at zero). Timestamp-derived so iOS background throttling stays accurate;
  no Vibration API (unsupported on iOS PWA).
- **Session tracking**: `sessions.ended_at` column (idempotent migration, set via
  COALESCE on completion). Finish screen shows duration / sets / volume /
  exercises / PRs; History shows per-session duration.
- **Inline exercise demos**: keyless — `frontend/scripts/resolve-demos.mjs` maps
  our exercises to yuhonas/free-exercise-db (CC0) and writes the committed
  `frontend/src/data/exerciseDemos.json` (start/end frame URLs on jsDelivr). The
  Exercise page alternates the two frames (~900ms) to animate; falls back to the
  YouTube link if a demo is missing or an image fails. Re-run `npm run
  resolve-demos` to refresh.
- **Tests**: Vitest (frontend pure logic) + pytest (backend) added — `npm test`
  in `frontend/`, `pytest` in `backend/` (deps in `requirements-dev.txt`).
- NOTE: `backend/requirements.txt` bumped (fastapi 0.138 / uvicorn 0.49 /
  pydantic 2.13.4) so it builds on local Python 3.14; validated in-container on
  `python:3.11-slim` (build + PATCH smoke) before deploy.
- `.gitignore` `data/` rule anchored to `/data/` so `frontend/src/data/` is tracked.
- **UX pass**: Screen Wake Lock (screen stays on during a workout), non-blocking
  toasts + inline two-tap delete (replaced `alert`/`confirm`), vibration at rest 0,
  big REST/GO countdown, WCAG-AA contrast, ≥44px tap targets, `prefers-reduced-motion`,
  and a faster logging loop (auto-expand/advance, per-exercise prefill, typeable weight).
- **Workout intelligence**: new `exercise_notes` table + `GET/PUT` notes endpoints;
  `GET /api/exercises/{id}/last` (previous workout's sets) and
  `GET /api/sessions/{id}/prs` (weight / reps@weight / Epley 1RM / session volume).
  Frontend shows previous performance + a deterministic progressive-overload hint,
  prefills weight from the last workout, comprehensive PRs in the summary, editable
  per-exercise notes, rest-timer pause + remembered duration (localStorage),
  loading skeletons. NOTE: `/api/progress` has no `completed` filter, so the live
  in-set PR toast can differ from the (completed-only, authoritative) summary PRs.

**Data persistence & backup**
- DB at `~/workout-tracker/data/workouts.db` (host bind mount `./data:/app/data`).
  Survives container restart/recreate, `compose down`, image updates, and all
  `docker ... prune`. Does NOT survive deleting that folder or **SD-card death**.
- Backup: implemented — nightly Pi→Google Drive via `scripts/backup.sh` (rclone).
  See the runbook below for setup and restore.

### Backup / restore (Phase 1)

- **On-demand snapshot (agent):** `GET /api/export` returns a full JSON snapshot.
  Before ANY schema-changing deploy, save one as a pre-deploy safety copy:
  `curl -s http://192.168.1.170:8080/api/export > pre-deploy-$(date +%F).json`.
- **Restore (agent, destructive):** `POST /api/import` with
  `{"mode":"replace","confirm":true,"envelope":<export-json>}`. It auto-snapshots
  the live DB to `data/pre-import-*.db` first and is atomic (rolls back on error).
  Without `confirm:true` it is a no-op `400`.
- **Manual file restore:** stop the container, drop a backup `.db` into
  `data/workouts.db`, restart.

### Nightly off-site backup — one-time Pi host setup

No host `sqlite3` is required — `scripts/backup.sh` does the DB read (`VACUUM
INTO`) **inside the app container** via `docker compose exec` and copies the
snapshot out with `docker cp`, rather than opening the DB file directly from
the host. Why: the container runs as root and switches the DB to WAL mode,
which produces root-owned `-shm`/`-wal` sidecar files; the host cron user
(`kapekost` — docker group, no sudo) can't open those directly, and
`python:3.11-slim` has no `sqlite3` CLI anyway (it does have Python, which the
script uses instead). Only `rclone` needs to be installed on the host.

1. `sudo apt-get install -y rclone` (or the `rclone` static binary).
2. `rclone config` → new remote named `gdrive` (Google Drive), authorise once.
3. Test: `bash ~/workout-tracker/scripts/backup.sh` → check the file appears in
   Drive and `GET /api/health` shows a recent `last_backup_at`.
4. Cron (host, not container): `crontab -e` →
   `30 3 * * * /bin/bash $HOME/workout-tracker/scripts/backup.sh >> $HOME/backup.log 2>&1`

Verify health: `curl -s http://192.168.1.170:8080/api/health` →
`{"status":"ok","last_backup_at":"…","last_backup_status":"ok"}`.

**Domain (HTTPS) — in progress**
- Target: `https://rpi-homeassistant.tailce23b4.ts.net` via Tailscale Serve.
- BLOCKED: tailnet HTTPS certs not enabled ("account does not support getting TLS
  certs"). User must enable: Tailscale admin → DNS → MagicDNS → "Enable HTTPS".
- Once enabled, run: `docker exec tailscale tailscale serve --bg 8080`
  (host-network container → proxies HTTPS root to `127.0.0.1:8080`).

**Next / ideas**
- Finish the HTTPS domain (above) once certs are enabled.
- ~~Decide on a backup mechanism.~~ Resolved: nightly `scripts/backup.sh` (rclone
  → Google Drive), see "Nightly off-site backup" above.
- Set up a scripted one-command deploy (build + transfer + restart) on the Mac.
- Optional: pin the image to a version tag instead of `:latest` for rollbacks.
- Enable `tailscale up --ssh` on the Pi (while physically on it) so deploys work over
  the VPN from anywhere — currently deploy needs the home LAN.

**Deferred UI cleanups** (from the 2026-06-29 sticky-bar/timer pass)
- Duplicate "Finish" in `Workout.jsx` — small top-right `Finish ✓` + big bottom
  `✓ Finish Workout`; consolidate to one clear spot.
- Auto-advance scroll jump — finishing an exercise's last set auto-opens/scrolls to the
  next exercise; could be calmed so the page doesn't jump under the thumb.
- Idle rest-timer hint — the old "Log a set to start rest timer" text was dropped when the
  bar became fixed-height; consider a subtle idle hint back if discoverability matters.
