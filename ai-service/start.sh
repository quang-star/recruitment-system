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

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8083
