FROM node:22-alpine AS frontend-build
WORKDIR /frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

FROM python:3.12-slim AS backend
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG TYPST_VERSION=0.14.2
RUN curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ -C /tmp \
    && mv "/tmp/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst \
    && rm -rf /tmp/typst-x86_64-unknown-linux-musl \
    && typst --version

COPY backend/pyproject.toml ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
    && pip install --no-cache-dir .

COPY --from=frontend-build /frontend/dist ./static

ENV MINIPLAN_DATABASE_URL=sqlite:////data/miniplan.db
ENV MINIPLAN_STATIC_FILES_DIR=/app/static
ENV MINIPLAN_SECRET_KEY_FILE=/data/secret_key

RUN useradd --create-home --uid 1000 miniplan \
    && mkdir -p /data \
    && chown -R miniplan:miniplan /app /data
VOLUME ["/data"]
USER miniplan

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD curl -fsS http://localhost:8000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
