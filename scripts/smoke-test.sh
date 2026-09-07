#!/usr/bin/env bash
set -euo pipefail

gateway_url="${GATEWAY_URL:-http://localhost:8080}"
web_url="${WEB_URL:-http://localhost:5173}"
candidate_email="${SMOKE_CANDIDATE_EMAIL:-}"
candidate_password="${SMOKE_CANDIDATE_PASSWORD:-}"
max_attempts="${MAX_ATTEMPTS:-30}"

command -v curl >/dev/null 2>&1 || {
  printf 'curl is required.\n' >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  printf 'python3 is required for JSON validation.\n' >&2
  exit 1
}

health_file="$(mktemp)"
jwks_file="$(mktemp)"
web_file="$(mktemp)"
login_file="$(mktemp)"
me_file="$(mktemp)"
jobs_file="$(mktemp)"
cleanup() {
  rm -f "$health_file" "$jwks_file" "$web_file" "$login_file" "$me_file" "$jobs_file"
}
trap cleanup EXIT

wait_for_endpoint() {
  local uri="$1"
  local output_file="$2"
  local attempt
  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$uri" -o "$output_file" 2>/dev/null; then
      return 0
    fi
    if ((attempt < max_attempts)); then
      sleep 2
    fi
  done
  printf 'Endpoint did not become ready: %s\n' "$uri" >&2
  return 1
}

wait_for_endpoint "$gateway_url/actuator/health" "$health_file"
python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); assert data.get("status") == "UP", data' "$health_file"

wait_for_endpoint "$gateway_url/.well-known/jwks.json" "$jwks_file"
python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); assert len(data.get("keys", [])) >= 1, data' "$jwks_file"

curl --fail --silent --show-error --max-time 10 "$web_url" -o "$web_file"
grep -q '<div id="root">' "$web_file" || {
  printf 'Web entry point is unavailable or malformed.\n' >&2
  exit 1
}

if [[ -z "$candidate_email" || -z "$candidate_password" ]]; then
  printf 'Public health/JWKS/Web smoke passed. Set SMOKE_CANDIDATE_EMAIL and SMOKE_CANDIDATE_PASSWORD to include login and Job listing.\n'
  exit 0
fi

login_payload="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"clientType":"WEB","deviceName":"Smoke script"}))' "$candidate_email" "$candidate_password")"
curl --fail --silent --show-error --max-time 10 \
  -H 'Content-Type: application/json' \
  --data "$login_payload" \
  "$gateway_url/api/v1/auth/login" \
  -o "$login_file"

access_token="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); token=data.get("accessToken"); assert token; print(token)' "$login_file")"
session_user_id="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); value=data.get("userId"); assert value; print(value)' "$login_file")"
correlation_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"

curl --fail --silent --show-error --max-time 10 \
  -H "Authorization: Bearer $access_token" \
  -H "X-Correlation-Id: $correlation_id" \
  "$gateway_url/api/v1/auth/me" \
  -o "$me_file"
python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); assert str(data.get("userId")) == sys.argv[2], data; assert "CANDIDATE" in data.get("roles", []), data' "$me_file" "$session_user_id"

curl --fail --silent --show-error --max-time 10 \
  -H "Authorization: Bearer $access_token" \
  -H "X-Correlation-Id: $correlation_id" \
  "$gateway_url/api/v1/candidate/jobs" \
  -o "$jobs_file"
job_count="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); assert isinstance(data, list), data; print(len(data))' "$jobs_file")"

printf 'Authenticated smoke passed for user %s; published Job count: %s.\n' "$session_user_id" "$job_count"
