#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
output_root="$repo_root/.local/backups"
quiesce=false
mc_image="${MINIO_MC_IMAGE:-minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727}"

usage() {
    printf 'Usage: %s [--output DIRECTORY] [--quiesce]\n' "$0"
}

while (($# > 0)); do
    case "$1" in
        --output)
            [[ $# -ge 2 ]] || { usage >&2; exit 2; }
            output_root="$2"
            shift
            ;;
        --quiesce)
            quiesce=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

compose=(docker compose -f "$repo_root/compose.yaml" -f "$repo_root/compose.dev.yaml")
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
absolute_output_root="$(mkdir -p -- "$output_root" && cd -- "$output_root" && pwd)"
final_backup_dir="$absolute_output_root/$timestamp"
backup_dir="$final_backup_dir.partial"
mkdir -p -- "$backup_dir/databases" "$backup_dir/minio"

postgres_container="$("${compose[@]}" ps -q postgres)"
minio_container="$("${compose[@]}" ps -q minio)"
core_container="$("${compose[@]}" ps -q core-service)"
for container in "$postgres_container" "$minio_container"; do
    [[ -n "$container" && "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || {
        printf 'PostgreSQL and MinIO must be running before backup.\n' >&2
        exit 1
    }
done

resume_stack=false
resume_services() {
    if [[ "$resume_stack" == true ]]; then
        "${compose[@]}" up -d auth-service core-service ai-service gateway-service web >/dev/null
        printf 'Application services resumed.\n'
    fi
}
trap resume_services EXIT

if [[ "$quiesce" == true ]]; then
    printf 'Quiescing application writers...\n'
    "${compose[@]}" stop web gateway-service ai-service core-service auth-service >/dev/null
    resume_stack=true
fi

printf 'Creating PostgreSQL custom-format dumps...\n'
for database in auth_db core_db ai_db; do
    partial="$backup_dir/databases/$database.dump.partial"
    final="$backup_dir/databases/$database.dump"
    docker exec "$postgres_container" pg_dump \
        --username platform_admin --dbname "$database" --format custom --compress 9 >"$partial"
    mv -- "$partial" "$final"
    docker exec -i "$postgres_container" pg_restore --list <"$final" >/dev/null
    printf '  %s verified\n' "$database"
done

count_relation() {
    local database="$1"
    local relation="$2"
    docker exec "$postgres_container" psql --username platform_admin --dbname "$database" \
        --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM $relation;"
}

counts_file="$backup_dir/counts.tsv"
: >"$counts_file"
for spec in \
    'auth_db auth_users' \
    'core_db candidate_profiles' \
    'core_db companies' \
    'core_db cvs' \
    'core_db jobs' \
    'core_db applications' \
    'core_db notifications' \
    'ai_db processing_tasks' \
    'ai_db parsed_cv_revisions' \
    'ai_db parsed_jd_revisions' \
    'ai_db matching_results'; do
    read -r database relation <<<"$spec"
    printf '%s\t%s\t%s\n' "$database" "$relation" "$(count_relation "$database" "$relation")" >>"$counts_file"
done

container_env() {
    local container="$1"
    local key="$2"
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
        | sed -n "s/^${key}=//p" | head -n 1
}

minio_user="$(container_env "$minio_container" MINIO_ROOT_USER)"
minio_password="$(container_env "$minio_container" MINIO_ROOT_PASSWORD)"
bucket="${CORE_STORAGE_BUCKET:-smart-recruitment-cv}"
if [[ -n "$core_container" ]]; then
    configured_bucket="$(container_env "$core_container" CORE_STORAGE_BUCKET)"
    [[ -z "$configured_bucket" ]] || bucket="$configured_bucket"
fi
[[ -n "$minio_user" && -n "$minio_password" ]] || {
    printf 'Cannot resolve MinIO credentials from the running container.\n' >&2
    exit 1
}

printf 'Mirroring MinIO bucket %s...\n' "$bucket"
mkdir -p -- "$backup_dir/minio/$bucket"
docker run --rm --network "container:$minio_container" \
    --entrypoint /bin/sh \
    --env "MINIO_ROOT_USER=$minio_user" \
    --env "MINIO_ROOT_PASSWORD=$minio_password" \
    --env "BACKUP_BUCKET=$bucket" \
    --volume "$backup_dir/minio:/backup" \
    "$mc_image" -ceu '
        mc alias set source http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
        if mc stat "source/$BACKUP_BUCKET" >/dev/null 2>&1; then
            mc mirror --overwrite "source/$BACKUP_BUCKET" "/backup/$BACKUP_BUCKET"
        fi
    '

object_count="$(find "$backup_dir/minio/$bucket" -type f | wc -l | tr -d ' ')"
object_bytes="$(du -sb "$backup_dir/minio/$bucket" | cut -f1)"
cat >"$backup_dir/manifest.env" <<EOF
format_version=1
created_at_utc=$timestamp
postgres_image=postgres:17-alpine
minio_image=RELEASE.2025-07-23T15-54-02Z
minio_bucket=$bucket
minio_object_count=$object_count
minio_object_bytes=$object_bytes
quiesced=$quiesce
EOF

(
    cd -- "$backup_dir"
    find databases minio -type f -print0 | sort -z | xargs -0 sha256sum
    sha256sum counts.tsv manifest.env
) >"$backup_dir/SHA256SUMS"

mv -- "$backup_dir" "$final_backup_dir"
printf 'Backup completed and checksummed: %s\n' "$final_backup_dir"
printf '  MinIO objects: %s (%s bytes)\n' "$object_count" "$object_bytes"
