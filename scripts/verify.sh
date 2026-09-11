#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
python_command="${PYTHON:-python3}"
install_ai_dependencies=false
run_compose_smoke=false

usage() {
    printf 'Usage: %s [--install-ai-dependencies] [--compose-smoke]\n' "$0"
}

while (($# > 0)); do
    case "$1" in
        --install-ai-dependencies)
            install_ai_dependencies=true
            ;;
        --compose-smoke)
            run_compose_smoke=true
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

run_gate() {
    local name="$1"
    shift
    printf '==> %s\n' "$name"
    "$@"
}

cd "$repo_root"

if [[ "$install_ai_dependencies" == true ]]; then
    run_gate "Install AI test dependencies" \
        "$python_command" -m pip install -c ai-service/requirements.lock -e './ai-service[test]'
fi

run_gate "Architecture validation" \
    "$python_command" scripts/validate-architecture.py
run_gate "Contract tests" \
    "$python_command" -m pytest -q -p no:cacheprovider contracts/tests

printf '==> AI tests\n'
(
    cd ai-service
    "$python_command" -m pytest -q -p no:cacheprovider
)

run_gate "Java tests" ./auth-service/mvnw -f pom.xml test

printf '==> Web unit/component tests\n'
(
    cd web
    npm test
)

printf '==> Web typecheck and production build\n'
(
    cd web
    npm run build
)

if [[ "$run_compose_smoke" == true ]]; then
    run_gate "Docker Compose configuration" \
        docker compose -f compose.yaml -f compose.dev.yaml config --quiet
    run_gate "Docker Compose smoke start" \
        docker compose -f compose.yaml -f compose.dev.yaml up -d --build
    run_gate "Docker Compose service status" \
        docker compose -f compose.yaml -f compose.dev.yaml ps
    run_gate "Gateway/Web smoke test" ./scripts/smoke-test.sh
fi

printf 'All verification gates passed.\n'
