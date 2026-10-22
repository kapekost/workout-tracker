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
# npm ci reports success but silently skips installing the musl rollup binary
# for this architecture (npm/cli#4828, hit 2026-08-25 for the first time after a
# dependency-changing PR regenerated the lockfile) — install it explicitly,
# version-matched to what the lockfile already pins, without touching the
# lockfile itself. The package name follows the build machine's architecture.
RUN npm ci && \
    ROLLUP_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/rollup'].version") && \
    case "$(uname -m)" in \
      aarch64) ROLLUP_ARCH=arm64 ;; \
      x86_64) ROLLUP_ARCH=x64 ;; \
      *) echo "unsupported architecture $(uname -m)" >&2; exit 1 ;; \
    esac && \
    npm install --no-save "@rollup/rollup-linux-$ROLLUP_ARCH-musl@$ROLLUP_VERSION"
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
COPY backend/main.py backend/plan_seed.py .
# One-off operator scripts run with `docker exec`, so they have to be in the
# image. Named explicitly rather than COPY scripts/ — the rest of that directory
# is host tooling (deploy, backup) that has no business in the container.
COPY scripts/bootstrap_owner.py ./scripts/
COPY --from=builder /frontend/dist ./static
RUN mkdir -p /app/data
EXPOSE 8000
# No curl in the slim image; an uncaught urllib error exits non-zero.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
