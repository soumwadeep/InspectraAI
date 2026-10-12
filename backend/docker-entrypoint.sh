#!/usr/bin/env sh
# Start the API, applying migrations first.
#
# A failed migration must stop the container. Starting uvicorn against an
# incomplete schema is worse: the process looks healthy, /health answers, and
# every database-backed request then 500s — which is exactly how this app looked
# "deployed" while it had zero tables.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying migrations (DATABASE_URL is read from the environment)"
  python -m alembic upgrade head
else
  echo "[entrypoint] RUN_MIGRATIONS is not true, skipping migrations"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
