# Git short SHA of the build — shown in the UI and /api/health.
# Pass with: --build-arg APP_COMMIT=$(git rev-parse --short HEAD)
ARG APP_COMMIT=dev

# Stage 1 — Build React frontend
# node:26-alpine (bumped from node:20-alpine, #23/2026-08-30) — needed no
# lockfile change; see AGENTS.md Gotchas for the reproduction that confirmed it.
FROM node:26-alpine AS builder
ARG APP_COMMIT
ENV APP_COMMIT=$APP_COMMIT
WORKDIR /frontend
COPY frontend/package*.json ./
# npm ci reports success but silently skips installing the arm64-musl rollup
# binary here (npm/cli#4828, hit 2026-08-25 for the first time after a
# dependency-changing PR regenerated the lockfile) — install it explicitly,
# version-matched to what the lockfile already pins, without touching the
# lockfile itself.
RUN npm ci && \
    ROLLUP_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/rollup'].version") && \
    npm install --no-save "@rollup/rollup-linux-arm64-musl@$ROLLUP_VERSION"
COPY frontend/ .
RUN npm run build

# Stage 2 — Python backend + serve built frontend
# No build tools: every dep ships a manylinux aarch64 wheel for py3.14, so pip
# never compiles (gcc alone was ~150 MB of dead weight on the 1 GB Pi). Re-verify
# this holds on any future base-image bump: CI never builds this Dockerfile, so a
# missing wheel shows up only as a real build failure here, never as a red check.
FROM python:3.14-slim
ARG APP_COMMIT
ENV APP_COMMIT=$APP_COMMIT
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py .
COPY --from=builder /frontend/dist ./static
RUN mkdir -p /app/data
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
