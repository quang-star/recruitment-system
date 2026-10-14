#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key_directory="$repo_root/.local/secrets"
private_key="$key_directory/auth-jwt-private.pem"
public_key="$key_directory/auth-jwt-public.pem"
force=false

if [[ "${1:-}" == "--force" ]]; then
  force=true
elif [[ $# -gt 0 ]]; then
  printf 'Usage: %s [--force]\n' "$0" >&2
  exit 2
fi

if [[ "$force" != true ]] && { [[ -e "$private_key" ]] || [[ -e "$public_key" ]]; }; then
  printf 'JWT key files already exist. Use --force only when intentional token invalidation is acceptable.\n' >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  printf 'OpenSSL is required to generate the local JWT key pair.\n' >&2
  exit 1
}

mkdir -p "$key_directory"
umask 077
openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$private_key"
openssl pkey -in "$private_key" -pubout -out "$public_key"
chmod 600 "$private_key"
chmod 644 "$public_key"

printf 'Generated local JWT keys under %s. The directory is excluded from Git and Docker build contexts.\n' "$key_directory"
