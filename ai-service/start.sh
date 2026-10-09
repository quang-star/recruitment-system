#!/bin/sh
set -eu

attempt=1
max_attempts="${DB_MIGRATION_MAX_ATTEMPTS:-30}"
retry_seconds="${DB_MIGRATION_RETRY_SECONDS:-2}"

until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database migration failed after $attempt attempts." >&2
    exit 1
  fi

  echo "Database is not ready; retrying migration in ${retry_seconds}s ($attempt/$max_attempts)." >&2
  attempt=$((attempt + 1))
  sleep "$retry_seconds"
done

python -m app.worker &
worker_pid=$!

python -m app.outbox &
outbox_pid=$!

uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8083 &
api_pid=$!
trap 'kill "$worker_pid" "$outbox_pid" "$api_pid" 2>/dev/null || true; wait || true' TERM INT EXIT

# Fail the container if any child exits so the supervisor can restart all three.
while kill -0 "$worker_pid" 2>/dev/null && kill -0 "$outbox_pid" 2>/dev/null && kill -0 "$api_pid" 2>/dev/null; do
  sleep 1
done
exit 1
