# Inspectra AI backend.
#
# Build context MUST be the repository root (Coolify: Build Context / Root
# Directory = "/", Dockerfile Location = "/backend/Dockerfile"), because the COPY
# paths below are prefixed with backend/.
#
# STATUS: authored, NOT built. Docker is not installed on the machine this was
# written on, so treat it as unverified until `docker build` says otherwise. The
# previous version of this file could not build at all: it ran
# `chown -R appuser:appuser /app /workspace` on a /workspace directory that was
# never created, and it copied only `app/`, so `alembic/`, `alembic.ini` and
# `scripts/` were absent from the image and no migration could ever run in the
# container — the app would boot and then 500 on every query against an empty
# schema.

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

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
