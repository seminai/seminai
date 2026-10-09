#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
docker compose -f compose.yaml pull postgres redis
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d --wait
echo "Stack updated. Pending database migrations are preceded by an automatic backup."
