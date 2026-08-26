# Git short SHA of the build — shown in the UI and /api/health.
# Pass with: --build-arg APP_COMMIT=$(git rev-parse --short HEAD)
ARG APP_COMMIT=dev

# Stage 1 — Build React frontend
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
# No build tools: every dep ships a manylinux aarch64 wheel for py3.11, so pip
# never compiles (gcc alone was ~150 MB of dead weight on the 1 GB Pi).
FROM python:3.11-slim
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
