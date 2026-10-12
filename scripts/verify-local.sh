#!/usr/bin/env bash
# Everything that can be checked on a workstation, with no Docker or Postgres.
# Exits non-zero if any check fails, and prints a per-check verdict rather than a
# single "success" line, so a partial pass cannot be read as a full pass.
set -uo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

note() { printf '%-28s %s\n' "$1" "$2"; }
run() {
  local label="$1"; shift
  # One log per check: sharing a file meant each check overwrote the previous
  # one's output, so a failure left no evidence behind.
  local log="$LOG_DIR/$(echo "$label" | tr ' ' '-').log"
  if "$@" >"$log" 2>&1; then
    note "$label" "PASS"
  else
    note "$label" "FAIL"
    sed -n '1,20p' "$log" | sed 's/^/      | /'
    FAIL=1
  fi
}

echo "Inspectra AI — local verification"
echo "----------------------------------"

command -v python3 >/dev/null || { echo "python3 not found"; exit 1; }
command -v npm >/dev/null || { echo "npm not found"; exit 1; }

run "backend imports"      bash -c 'cd backend && python3 -c "import app.main"'
run "pytest suite"         bash -c 'cd backend && python3 -m pytest tests/ -q'
run "frontend typecheck"   npx tsc --noEmit
run "frontend lint"        npm run lint

# Schema drift: the migration head must equal the revision the database reports.
run "alembic head == db"   bash -c '
  cd backend
  HEAD=$(python3 -m alembic heads 2>/dev/null | head -1 | cut -d" " -f1)
  python3 - "$HEAD" <<PY
import sys
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine
from app.config import settings
expected = sys.argv[1]
with create_engine(settings.database_url).connect() as conn:
    current = MigrationContext.configure(conn).get_current_revision()
print(f"head={expected} current={current}")
sys.exit(0 if current == expected else 1)
PY'

echo
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: all local checks passed."
  echo "This says nothing about Docker, Postgres, AWS or Coolify — see verify-deployment.sh."
else
  echo "RESULT: one or more local checks FAILED."
fi
exit $FAIL
