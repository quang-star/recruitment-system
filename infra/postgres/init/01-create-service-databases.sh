#!/bin/sh
set -eu

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set auth_password="$AUTH_DB_PASSWORD" \
  --set core_password="$CORE_DB_PASSWORD" \
  --set ai_password="$AI_DB_PASSWORD" <<-'EOSQL'
CREATE ROLE auth_service LOGIN PASSWORD :'auth_password';
CREATE ROLE core_service LOGIN PASSWORD :'core_password';
CREATE ROLE ai_service LOGIN PASSWORD :'ai_password';

CREATE DATABASE auth_db OWNER auth_service;
CREATE DATABASE core_db OWNER core_service;
CREATE DATABASE ai_db OWNER ai_service;

REVOKE ALL ON DATABASE auth_db FROM PUBLIC;
REVOKE ALL ON DATABASE core_db FROM PUBLIC;
REVOKE ALL ON DATABASE ai_db FROM PUBLIC;

GRANT CONNECT ON DATABASE auth_db TO auth_service;
GRANT CONNECT ON DATABASE core_db TO core_service;
GRANT CONNECT ON DATABASE ai_db TO ai_service;
EOSQL
