#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
mc_image="${MINIO_MC_IMAGE:-minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727}"

if [[ $# -ne 1 || "$1" == '-h' || "$1" == '--help' ]]; then
    printf 'Usage: %s BACKUP_DIRECTORY\n' "$0"
    exit $(( $# == 1 ? 0 : 2 ))
fi

backup_dir="$(cd -- "$1" && pwd)"
for required in SHA256SUMS manifest.env counts.tsv databases/auth_db.dump databases/core_db.dump databases/ai_db.dump; do
    [[ -f "$backup_dir/$required" ]] || { printf 'Missing backup file: %s\n' "$required" >&2; exit 1; }
done
(
    cd -- "$backup_dir"
    sha256sum --check SHA256SUMS
)

suffix="$$-$(date +%s)"
postgres_container="datn-restore-postgres-$suffix"
minio_container="datn-restore-minio-$suffix"
cleanup() {
    docker rm --force "$postgres_container" "$minio_container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf 'Starting isolated PostgreSQL restore target...\n'
docker run --detach --rm --name "$postgres_container" \
    --env POSTGRES_PASSWORD=rehearsal-only postgres:17-alpine >/dev/null
for _ in {1..40}; do
    docker exec "$postgres_container" pg_isready --username postgres --dbname postgres >/dev/null 2>&1 && break
    sleep 1
done
docker exec "$postgres_container" pg_isready --username postgres --dbname postgres >/dev/null

docker exec -i "$postgres_container" psql --username postgres --dbname postgres \
    --set ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE ROLE auth_service LOGIN;
CREATE ROLE core_service LOGIN;
CREATE ROLE ai_service LOGIN;
CREATE DATABASE auth_db OWNER auth_service;
CREATE DATABASE core_db OWNER core_service;
CREATE DATABASE ai_db OWNER ai_service;
SQL

for database in auth_db core_db ai_db; do
    docker exec -i "$postgres_container" pg_restore --username postgres --dbname "$database" \
        --exit-on-error <"$backup_dir/databases/$database.dump"
    printf '  %s restored\n' "$database"
done

printf 'Comparing database row counts...\n'
while IFS=$'\t' read -r database relation expected; do
    actual="$(docker exec "$postgres_container" psql --username postgres --dbname "$database" \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM $relation;")"
    [[ "$actual" == "$expected" ]] || {
        printf 'Count mismatch for %s.%s: expected %s, got %s\n' "$database" "$relation" "$expected" "$actual" >&2
        exit 1
    }
    printf '  %s.%s = %s\n' "$database" "$relation" "$actual"
done <"$backup_dir/counts.tsv"

auth_migrations="$(docker exec "$postgres_container" psql -U postgres -d auth_db -Atc \
    "SELECT count(*) FROM flyway_schema_history WHERE success;")"
core_migrations="$(docker exec "$postgres_container" psql -U postgres -d core_db -Atc \
    "SELECT count(*) FROM flyway_schema_history WHERE success;")"
ai_revision="$(docker exec "$postgres_container" psql -U postgres -d ai_db -Atc \
    'SELECT version_num FROM alembic_version;')"
[[ "$auth_migrations" -gt 0 && "$core_migrations" -gt 0 && -n "$ai_revision" ]] || {
    printf 'Migration metadata validation failed.\n' >&2
    exit 1
}
printf '  migrations: Auth=%s, Core=%s, AI=%s\n' "$auth_migrations" "$core_migrations" "$ai_revision"

manifest_value() {
    local key="$1"
    sed -n "s/^${key}=//p" "$backup_dir/manifest.env" | head -n 1
}
bucket="$(manifest_value minio_bucket)"
expected_objects="$(manifest_value minio_object_count)"
[[ -n "$bucket" && "$expected_objects" =~ ^[0-9]+$ ]] || { printf 'Invalid MinIO manifest.\n' >&2; exit 1; }

printf 'Starting isolated MinIO restore target...\n'
docker run --detach --rm --name "$minio_container" \
    --env MINIO_ROOT_USER=rehearsal \
    --env MINIO_ROOT_PASSWORD=rehearsal-secret \
    minio/minio:RELEASE.2025-07-23T15-54-02Z server /data >/dev/null
for _ in {1..40}; do
    docker exec "$minio_container" curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 && break
    sleep 1
done
docker exec "$minio_container" curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null

actual_objects="$(docker run --rm --network "container:$minio_container" \
    --entrypoint /bin/sh \
    --env MINIO_ROOT_USER=rehearsal \
    --env MINIO_ROOT_PASSWORD=rehearsal-secret \
    --env "RESTORE_BUCKET=$bucket" \
    --volume "$backup_dir/minio:/backup:ro" \
    "$mc_image" -ceu '
        mc alias set target http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
        mc mb --ignore-existing "target/$RESTORE_BUCKET" >/dev/null
        mc mirror --overwrite "/backup/$RESTORE_BUCKET" "target/$RESTORE_BUCKET" >/dev/null
        mc find "target/$RESTORE_BUCKET" | wc -l | tr -d " "
    ')"
[[ "$actual_objects" == "$expected_objects" ]] || {
    printf 'MinIO count mismatch: expected %s, got %s\n' "$expected_objects" "$actual_objects" >&2
    exit 1
}

printf 'Restore rehearsal passed without touching the running Compose volumes.\n'
printf '  PostgreSQL: all tracked counts and migration metadata match\n'
printf '  MinIO bucket %s: %s objects restored\n' "$bucket" "$actual_objects"
