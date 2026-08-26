# Gym Tracker

Mobile-first workout tracker PWA: logs sets/reps/weight, tracks progress, shows
form cues for a 4-day Upper/Lower split (Upper A → Lower A → Upper B → Lower B).

Runs as a single Docker container on a resource-constrained home server (a
Raspberry Pi 3 B+, alongside other long-running services on the same box).
**Ops truth lives in [AGENTS.md](AGENTS.md)** (generic) **and
`AGENTS.local.md`** (gitignored — the real deploy target's specifics) —
runbook, hard rules, backup & restore, status. This file is the newcomer
intro.

## Stack

- **Backend**: Python FastAPI + SQLite (WAL, `user_version` migrations, pytest)
- **Frontend**: React + Vite + Recharts (Vitest + Playwright), installable PWA
  with offline reads (service worker, self-hosted fonts). Styled via
  `frontend/src/lib/theme.js` tokens and hand-written CSS, no CSS framework.
- **Deploy**: one multi-stage arm64 image, **built off-device and streamed to
  the Pi over SSH** (`docker save | ssh | docker load`) — no registry, on
  purpose; compose has `pull_policy: never` and no `build:` key

> **Don't build on the Pi.** A 1 GB Pi can't compile the Vite frontend without
> thrashing swap and starving whatever else is running on the same box. Build
> elsewhere, stream the finished image over.

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

Shape of it (build elsewhere, stream to the deploy target, run, verify —
full runbook in [AGENTS.md](AGENTS.md); the real host and commands for this
deployment are in the gitignored `AGENTS.local.md`):

```bash
# build (arm64) and stream to the deploy target — no registry
docker buildx build --pull --platform linux/arm64 -t kapekost/workout-tracker:latest --load .
docker save kapekost/workout-tracker:latest | gzip | ssh <host> 'gunzip | docker load'

# deploy target: run the loaded image (never builds, never pulls)
cd ~/workout-tracker && git pull && docker compose up -d
```

## Access away from home

If the deploy target runs Tailscale, the app is reachable over the tailnet
too — see `AGENTS.local.md` for the actual address.

## Data & backups

SQLite in a bind-mounted volume on the deploy target (survives container
updates). Backups are automated: nightly `scripts/backup.sh` snapshots the
DB and uploads to Google Drive; `GET /api/health` shows the last backup
status. Restore options are described in `AGENTS.md`'s Runbook section; the
drill log and this deployment's exact paths are in `AGENTS.local.md`.

## Agent orchestration

Scaffolded from [`agent-scaffold`](https://github.com/kapekost/agent-scaffold) (Copier — see
`.copier-answers.yml` for the template ref; `copier update` pulls later template changes in as a
reviewable diff). Tasks are tracked as GitHub Issues (`type`/`priority`/`effort` labels), driven by
the `/orchestrate` Claude Code command; rules and current state live in `docs/orchestration/`. See
[AGENTS.md](AGENTS.md#orchestration) for the pointer, and `docs/orchestration/GUARDRAILS.md` for
the hard rules — independent of, and secondary to, the deploy hard rules elsewhere in AGENTS.md.
