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

### Typical change loop
Edit code on the Mac → commit & push → **Build** → **Transfer** → **Run/update** on
the Pi → **Verify**. The git push keeps source history; the image transfer is what
actually updates the running app.

## Gotchas learned the hard way

- `sudo` over a non-interactive SSH session hangs waiting for a password. Avoid it;
  the `kapekost` user is in the `docker` group, so `docker ...` needs no `sudo`.
- The `tailscale` CLI is **not** on the Pi host — it's inside the `tailscale`
  container: `docker exec tailscale tailscale ip -4`.
- The running app footprint is tiny (~12 MiB RAM, <1% CPU). If the Pi is ever
  thrashing again, something is **building** — stop it; never build here.

## Status

_Last updated: 2026-06-28._

**Done**
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
- Backup: **not yet set up** (deferred by decision on 2026-06-28). Options on the
  table — nightly Pi→Google Drive (rclone), nightly Pi→Mac (rsync), or an on-demand
  `/api/export` endpoint. Revisit; SD cards do fail.

**Domain (HTTPS) — in progress**
- Target: `https://rpi-homeassistant.tailce23b4.ts.net` via Tailscale Serve.
- BLOCKED: tailnet HTTPS certs not enabled ("account does not support getting TLS
  certs"). User must enable: Tailscale admin → DNS → MagicDNS → "Enable HTTPS".
- Once enabled, run: `docker exec tailscale tailscale serve --bg 8080`
  (host-network container → proxies HTTPS root to `127.0.0.1:8080`).

**Next / ideas**
- Finish the HTTPS domain (above) once certs are enabled.
- Decide on a backup mechanism.
- Set up a scripted one-command deploy (build + transfer + restart) on the Mac.
- Optional: pin the image to a version tag instead of `:latest` for rollbacks.
