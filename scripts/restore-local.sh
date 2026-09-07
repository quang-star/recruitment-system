#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
mc_image="${MINIO_MC_IMAGE:-minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727}"

if [[ $# -ne 2 || "$2" != '--confirm-replace-current-data' ]]; then
    printf 'Usage: %s BACKUP_DIRECTORY --confirm-replace-current-data\n' "$0" >&2
    printf 'This command replaces all current auth/core/AI database and CV object data.\n' >&2
    exit 2
fi

backup_dir="$(cd -- "$1" && pwd)"
for required in SHA256SUMS manifest.env counts.tsv databases/auth_db.dump databases/core_db.dump databases/ai_db.dump; do
    [[ -f "$backup_dir/$required" ]] || { printf 'Missing backup file: %s\n' "$required" >&2; exit 1; }
done
(
    cd -- "$backup_dir"
    sha256sum --check SHA256SUMS
)

compose=(docker compose -f "$repo_root/compose.yaml" -f "$repo_root/compose.dev.yaml")
postgres_container="$("${compose[@]}" ps -q postgres)"
minio_container="$("${compose[@]}" ps -q minio)"
[[ -n "$postgres_container" && -n "$minio_container" ]] || {
    printf 'PostgreSQL and MinIO must be running.\n' >&2
    exit 1
}

container_env() {
    local container="$1"
    local key="$2"
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
        | sed -n "s/^${key}=//p" | head -n 1
}
manifest_value() {
    local key="$1"
    sed -n "s/^${key}=//p" "$backup_dir/manifest.env" | head -n 1
}

printf 'Stopping application services before destructive local restore...\n'
"${compose[@]}" stop web gateway-service ai-service core-service auth-service >/dev/null

for spec in 'auth_db auth_service' 'core_db core_service' 'ai_db ai_service'; do
    read -r database owner <<<"$spec"
    docker exec "$postgres_container" dropdb --username platform_admin --force --if-exists "$database"
    docker exec "$postgres_container" createdb --username platform_admin --owner "$owner" "$database"
    docker exec -i "$postgres_container" pg_restore --username platform_admin --dbname "$database" \
        --exit-on-error <"$backup_dir/databases/$database.dump"
    printf '  %s replaced\n' "$database"
done

minio_user="$(container_env "$minio_container" MINIO_ROOT_USER)"
minio_password="$(container_env "$minio_container" MINIO_ROOT_PASSWORD)"
bucket="$(manifest_value minio_bucket)"
expected_objects="$(manifest_value minio_object_count)"
actual_objects="$(docker run --rm --network "container:$minio_container" \
    --entrypoint /bin/sh \
    --env "MINIO_ROOT_USER=$minio_user" \
    --env "MINIO_ROOT_PASSWORD=$minio_password" \
    --env "RESTORE_BUCKET=$bucket" \
    --volume "$backup_dir/minio:/backup:ro" \
    "$mc_image" -ceu '
        mc alias set target http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
        mc rm --recursive --force "target/$RESTORE_BUCKET" >/dev/null 2>&1 || true
        mc mb --ignore-existing "target/$RESTORE_BUCKET" >/dev/null
        mc mirror --overwrite "/backup/$RESTORE_BUCKET" "target/$RESTORE_BUCKET" >/dev/null
        mc find "target/$RESTORE_BUCKET" | wc -l | tr -d " "
    ')"
[[ "$actual_objects" == "$expected_objects" ]] || {
    printf 'MinIO count mismatch after restore. Application services remain stopped.\n' >&2
    exit 1
}

while IFS=$'\t' read -r database relation expected; do
    actual="$(docker exec "$postgres_container" psql --username platform_admin --dbname "$database" \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM $relation;")"
    [[ "$actual" == "$expected" ]] || {
        printf 'Database count mismatch for %s.%s. Application services remain stopped.\n' "$database" "$relation" >&2
        exit 1
    }
done <"$backup_dir/counts.tsv"

"${compose[@]}" up -d auth-service core-service ai-service gateway-service web >/dev/null
printf 'Local restore completed; application services restarted.\n'
printf 'Run ./scripts/smoke-test.sh before accepting traffic.\n'
