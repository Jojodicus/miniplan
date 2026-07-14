# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM python:3.12-slim AS typst-fetch
ARG TYPST_VERSION=0.14.2
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ -C /tmp \
    && mv "/tmp/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst \
    && rm -rf /tmp/typst-x86_64-unknown-linux-musl \
    && typst --version

# Eigener Stage nur fuers Herunterladen: curl/xz-utils (und der ungenutzte Rest des Release-Tarballs)
# landen so nicht im Backend-Image, es wird nur die fertige typst-Binary rueberkopiert.
FROM python:3.12-slim AS backend
WORKDIR /app

# User/Verzeichnisse ganz am Anfang anlegen: hängt an nichts als dem Base-Image, bleibt also über
# jeden Build hinweg gecacht, in dem sich nur App- oder Frontend-Code ändert. Nachfolgende COPYs
# bekommen die Ownership direkt per --chown mit - so entfällt ein abschließendes rekursives
# `chown -R /app`, das sonst bei jeder Codeänderung den kompletten (venv + Static-Build
# eingeschlossen) Baum erneut anfassen müsste.
RUN useradd --no-create-home --uid 1000 miniplan \
    && mkdir -p /data \
    && chown miniplan:miniplan /app /data
VOLUME ["/data"]

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
COPY --from=typst-fetch /usr/local/bin/typst /usr/local/bin/typst

# venv statt System-Python, damit `uv sync` unter dem non-root User (miniplan) nicht gegen
# /usr/lib/python3.12/site-packages schreiben muss. UV_CACHE_DIR explizit gesetzt, weil miniplan
# ohne Home-Verzeichnis (--no-create-home) kein $HOME hat, wo uv sonst per Default cachen würde.
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_CACHE_DIR=/app/.uv-cache \
    PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    MINIPLAN_DATABASE_URL=sqlite:////data/miniplan.db \
    MINIPLAN_STATIC_FILES_DIR=/app/static \
    MINIPLAN_SECRET_KEY_FILE=/data/secret_key \
    MINIPLAN_MEDIA_DIR=/data/media

USER miniplan

# Dependencies vor dem App-Code installieren (eigener Layer, per uv.lock reproduzierbar) - ein
# reiner Code-Änderung invalidiert diesen Layer nicht, und der `uv`-Cache-Mount überlebt auch
# einen invalidierten Layer über mehrere Builds hinweg.
COPY --chown=miniplan:miniplan backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/app/.uv-cache,uid=1000,gid=1000 \
    uv sync --locked --no-install-project --no-dev

COPY --chown=miniplan:miniplan backend/app ./app
COPY --chown=miniplan:miniplan backend/alembic ./alembic
COPY --chown=miniplan:miniplan --chmod=755 backend/alembic.ini backend/docker-entrypoint.sh ./
RUN --mount=type=cache,target=/app/.uv-cache,uid=1000,gid=1000 \
    uv sync --locked --no-dev

COPY --from=frontend-build --chown=miniplan:miniplan /frontend/dist ./static

EXPOSE 8000
# python statt curl fuers Healthcheck, damit curl nicht extra ins Image muss (wird sonst
# nirgends zur Laufzeit gebraucht).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/health', timeout=2)" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
