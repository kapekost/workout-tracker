# Git short SHA of the build — shown in the UI and /api/health.
# Pass with: --build-arg APP_COMMIT=$(git rev-parse --short HEAD)
ARG APP_COMMIT=dev

# Stage 1 — Build React frontend
FROM node:20-alpine AS builder
ARG APP_COMMIT
ENV APP_COMMIT=$APP_COMMIT
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
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
