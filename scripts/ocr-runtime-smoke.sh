#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
compose=(docker compose -f "$repo_root/compose.yaml" -f "$repo_root/compose.dev.yaml")
container="$("${compose[@]}" ps -q ai-service)"
fixture="$repo_root/ai-service/tests/fixtures/minimal-cv.pdf"
container_fixture="/tmp/datn-ocr-smoke-source.pdf"

[[ -n "$container" && "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || {
    printf 'AI service must be running before the OCR smoke test.\n' >&2
    exit 1
}

docker cp "$fixture" "$container:$container_fixture" >/dev/null
cleanup() {
    docker exec "$container" rm --force -- "$container_fixture" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$container" python -m app.evaluation.ocr_smoke \
    --source "$container_fixture" \
    --expect-skill Java \
    --expect-skill Kafka

