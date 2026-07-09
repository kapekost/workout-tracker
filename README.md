# Gym Tracker

Mobile-first workout tracker PWA: logs sets/reps/weight, tracks progress, shows
form cues for a 4-day Upper/Lower split (Upper A → Lower A → Upper B → Lower B).

Runs as a single Docker container on a Raspberry Pi 3 B+ next to Home Assistant.
**Ops truth lives in [AGENTS.md](AGENTS.md)** — runbook, hard rules, backup &
restore, status. This file is the newcomer intro.

## Stack

- **Backend**: Python FastAPI + SQLite (WAL, `user_version` migrations, pytest)
- **Frontend**: React + Vite + Tailwind + Recharts (Vitest), installable PWA
  with offline reads (service worker, self-hosted fonts)
- **Deploy**: one multi-stage arm64 image, **built off-device and streamed to
  the Pi over SSH** (`docker save | ssh | docker load`) — no registry, on
  purpose; compose has `pull_policy: never` and no `build:` key

> **Don't build on the Pi.** A 1 GB Pi can't compile the Vite frontend without
> thrashing swap and starving Home Assistant. Build on the Mac, stream the
> finished image over.

## Features

- 📋 4-day Upper/Lower split with per-exercise form cues and inline two-frame
  exercise demos (CC0, YouTube fallback)
- ⏱ Sticky session clock + auto-starting 90s rest countdown (±30s, pause,
  skip; beep + flash at zero; iOS-safe timestamp math)
- 🏆 PR detection (weight / reps@weight / est. 1RM / session volume) with a
  quiet "baseline" note for first-ever entries instead of fake PRs
- 📈 Progress charts per exercise (completed sessions, most recent 60)
- 🧠 Previous-workout panel, progressive-overload hint, weight prefill,
  per-exercise notes
- ▶️ Resume an in-progress workout from any page; screen stays awake mid-workout
- 📊 Usage analytics (`/api/events` → `/api/analytics/summary`)
- 💾 "Export my data" on Home; guarded `POST /api/import` restore; nightly
  rclone backup to Google Drive with health heartbeat (`/api/health`)

## Development (Mac)

```bash
# backend — http://localhost:8000
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
DATABASE_URL=/tmp/dev-workouts.db .venv/bin/uvicorn main:app --reload

# frontend — http://localhost:5173 (proxies /api to :8000)
cd frontend
npm install
npm run dev

# tests
cd backend && .venv/bin/python -m pytest
cd frontend && npm test
```

## Deploy

Short version (full runbook + verify steps in [AGENTS.md](AGENTS.md)):

```bash
# Mac: build (arm64, native on Apple Silicon) and stream to the Pi
docker buildx build --pull --platform linux/arm64 -t kapekost/workout-tracker:latest --load .
docker save kapekost/workout-tracker:latest | gzip | \
  ssh kapekost@192.168.1.170 'gunzip | docker load'

# Pi: run the loaded image (never builds, never pulls)
cd ~/workout-tracker && git pull && docker compose up -d
```

App: `http://192.168.1.170:8080` on the LAN.

## Access from the gym

Tailscale already runs on the Pi (as a container in host network mode — don't
install it on the host). With the Tailscale app on your phone signed into the
same tailnet, the app is at `http://100.64.119.1:8080`.

## Data & backups

SQLite at `~/workout-tracker/data/workouts.db` on the Pi (bind-mounted volume;
survives container updates). Backups are automated: nightly `scripts/backup.sh`
snapshots the DB and uploads to Google Drive; `GET /api/health` shows the last
backup status. Restore options and the drill log are in
[AGENTS.md](AGENTS.md#restore).
