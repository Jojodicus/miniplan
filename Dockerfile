# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM python:3.12-slim AS backend
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

ARG TYPST_VERSION=0.14.2
RUN curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ -C /tmp \
    && mv "/tmp/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst \
    && rm -rf /tmp/typst-x86_64-unknown-linux-musl \
    && typst --version

# venv statt System-Python, damit `uv sync` unter dem späteren non-root User (miniplan) nicht
# gegen /usr/lib/python3.12/site-packages schreiben muss.
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:${PATH}"

# Dependencies vor dem App-Code installieren (eigener Layer, per uv.lock reproduzierbar) - ein
# reiner Code-Änderung invalidiert diesen Layer nicht, und der `uv`-Cache-Mount überlebt auch
# einen invalidierten Layer über mehrere Builds hinweg.
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/docker-entrypoint.sh ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev \
    && chmod +x docker-entrypoint.sh

COPY --from=frontend-build /frontend/dist ./static

ENV MINIPLAN_DATABASE_URL=sqlite:////data/miniplan.db
ENV MINIPLAN_STATIC_FILES_DIR=/app/static
ENV MINIPLAN_SECRET_KEY_FILE=/data/secret_key
# Hochgeladene Pfarrei-Bilder im persistenten Volume ablegen (nicht im Frontend-Build).
ENV MINIPLAN_MEDIA_DIR=/data/media

RUN useradd --create-home --uid 1000 miniplan \
    && mkdir -p /data \
    && chown -R miniplan:miniplan /app /data
VOLUME ["/data"]
USER miniplan

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD curl -fsS http://localhost:8000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
