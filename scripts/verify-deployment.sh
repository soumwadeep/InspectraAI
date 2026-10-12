#!/usr/bin/env bash
# Deployment verification that reports BLOCKED instead of guessing.
#
# The reason this script exists as a separate file: a single "verify" script that
# quietly skips the checks it cannot run produces a green result that means
# nothing. Every unavailable tool here is reported as BLOCKED with the reason, and
# the script exits non-zero unless the checks it did run all passed AND nothing is
# blocked — so it can never print a bare "success" on a machine without Docker.
set -uo pipefail
cd "$(dirname "$0")/.."

BLOCKED=0
FAILED=0
note() { printf '%-34s %s\n' "$1" "$2"; }

have() { command -v "$1" >/dev/null 2>&1; }

echo "Inspectra AI — deployment verification"
echo "---------------------------------------"

# --- Docker ---------------------------------------------------------------
if have docker; then
  if docker build -f backend/Dockerfile -t inspectra-api-verify . >/tmp/inspectra-docker-build.log 2>&1; then
    note "backend image builds" "PASS"
  else
    note "backend image builds" "FAIL (log: /tmp/inspectra-docker-build.log)"
    FAILED=1
  fi
  if docker build -f Dockerfile.web -t inspectra-web-verify . >/tmp/inspectra-docker-web.log 2>&1; then
    note "frontend image builds" "PASS"
  else
    note "frontend image builds" "FAIL (log: /tmp/inspectra-docker-web.log)"
    FAILED=1
  fi
else
  note "backend image builds" "BLOCKED (docker not installed)"
  note "frontend image builds" "BLOCKED (docker not installed)"
  BLOCKED=1
fi

# --- Postgres -------------------------------------------------------------
if have pg_isready && [ -n "${VERIFY_DATABASE_URL:-}" ]; then
  if have psql; then
    if psql "$VERIFY_DATABASE_URL" -c 'select 1' >/dev/null 2>&1; then
      note "postgres reachable" "PASS"
    else
      note "postgres reachable" "FAIL"
      FAILED=1
    fi
  else
    note "postgres reachable" "BLOCKED (psql not installed)"
    BLOCKED=1
  fi
else
  note "postgres migration path" "BLOCKED (no VERIFY_DATABASE_URL / no client)"
  BLOCKED=1
fi

# --- AWS / COOL -----------------------------------------------------------
if [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  note "aws credentials present" "configured (not exercised by this script)"
else
  note "aws / s3 / cool integration" "BLOCKED (no credentials configured)"
  BLOCKED=1
fi

# --- Coolify release ------------------------------------------------------
# Only a live probe counts. A configured domain is not evidence of a working
# deployment, so this never infers health from the presence of a URL.
if [ -n "${VERIFY_PUBLIC_URL:-}" ]; then
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "${VERIFY_PUBLIC_URL%/}/backend-api/health" || echo 000)
  if [ "$code" = "200" ]; then
    note "deployed /backend-api/health" "PASS (200)"
  else
    note "deployed /backend-api/health" "FAIL (HTTP $code)"
    FAILED=1
  fi
else
  note "deployed health endpoint" "BLOCKED (set VERIFY_PUBLIC_URL to check)"
  BLOCKED=1
fi

echo
echo "---------------------------------------"
if [ "$FAILED" -ne 0 ]; then
  echo "RESULT: FAILED — a check that could run did not pass."
elif [ "$BLOCKED" -ne 0 ]; then
  echo "RESULT: PARTIAL — everything that could run passed, but some checks were"
  echo "        BLOCKED on this machine. Do not describe this as a verified"
  echo "        deployment. Re-run on a host with Docker and Postgres access."
  exit 2
else
  echo "RESULT: PASS — every check ran and passed."
fi
exit "$FAILED"
