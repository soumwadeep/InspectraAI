# Inspectra AI backend.
#
# Build context MUST be the repository root (Coolify: Build Context / Root
# Directory = "/", Dockerfile Location = "/backend/Dockerfile"), because the COPY
# paths below are prefixed with backend/.
#
# STATUS: builds and boots. Verified on the deployment host — the image built,
# `alembic upgrade head` connected via PostgresqlImpl, and uvicorn reached
# "Application startup complete". The first version of this file could not build
# at all: it ran `chown -R appuser:appuser /app /workspace` on a /workspace
# directory that was never created, and it copied only `app/`, so `alembic/`,
# `alembic.ini` and `scripts/` were absent from the image and no migration could
# ever run in the container — the app would boot and then 500 on every query
# against an empty schema.
#
# Still unverified by the author: this file has never been built locally, because
# Docker is not installed on the development machine. Every claim above comes from
# the deployment host's build log.

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# libglib2.0-0 and libgomp1 are what opencv-python-headless links against.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Requirements first, so application edits reuse this layer.
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini ./alembic.ini
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/scripts ./scripts

# Uploads and derived evidence are written at runtime, so the unprivileged user
# needs the whole tree owned by it — including storage/, which previously did not
# exist yet when ownership was set.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/storage/uploads \
    && chown -R appuser:appuser /app

COPY backend/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser

# Coolify injects PORT and expects the app to bind to it — the deployed container
# came up on 3010, not 8000. EXPOSE is only documentation here; the real port comes
# from the environment at run time.
EXPOSE 8000

# The probe must read the same variable the entrypoint binds to. Hardcoding 8000
# made curl fail with "Failed to connect to localhost port 8000" against a
# perfectly healthy app on $PORT, so Coolify rolled back a working deployment.
#
# It probes /health/live, not /health: /health opens two Postgres connections per
# call, and a deploy log showed "Health check exceeded timeout (5s)" while
# uvicorn was already listening. A liveness probe must not depend on the database.
#
# start-period is generous because this host is a Raspberry Pi running ~25
# containers: the entrypoint runs `alembic upgrade head` before uvicorn starts,
# and the observed boot crossed Coolify's previous ~115s window with the app
# reaching "Application startup complete" only after the rollback was decided.
HEALTHCHECK --interval=15s --timeout=10s --start-period=180s --retries=6 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health/live" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
