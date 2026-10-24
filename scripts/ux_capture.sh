#!/usr/bin/env bash
# Capture every screen for a UX review into frontend/ux-shots/. See docs/ux/REVIEW-CONTRACT.md.
# Starts the backend on a throwaway DB under /tmp, seeds it, starts Vite, screenshots, stops both.
# Needs backend/.venv and frontend/node_modules (AGENTS.md, "Local development").
set -euo pipefail
cd "$(dirname "$0")/.."

DB="/tmp/ux-$$.db"
PY="${UX_PYTHON:-backend/.venv/bin/python}"
export DATABASE_URL="$DB"
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; rm -f "$DB" "$DB-wal" "$DB-shm"; }
trap cleanup EXIT

(cd backend && exec "../$PY" -m uvicorn main:app --port 8000 >/tmp/ux-backend.log 2>&1) & pids+=($!)
(cd frontend && exec ./node_modules/.bin/vite --port 5173 >/tmp/ux-frontend.log 2>&1) & pids+=($!)

for _ in $(seq 1 60); do
  code=0; curl -sf localhost:8000/api/auth/me -o /dev/null 2>/dev/null || code=$?
  # /api/auth/me answers 401 when up; curl -f turns that into exit 22.
  if { [ "$code" = 22 ] || [ "$code" = 0 ]; } && curl -sf localhost:5173 -o /dev/null; then break; fi
  sleep 1
done

"$PY" scripts/ux_seed.py
rm -rf frontend/ux-shots
(cd frontend && node scripts/ux-screens.mjs)
