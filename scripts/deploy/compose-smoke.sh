#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
docker compose -f compose.yaml config >/dev/null
echo "compose.yaml is valid"
docker compose -f compose.yaml up -d postgres redis
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose -f compose.yaml exec -T postgres pg_isready -U seminai >/dev/null 2>&1 \
    && docker compose -f compose.yaml exec -T redis redis-cli ping >/dev/null 2>&1; then
    echo "postgres and redis are healthy"
    exit 0
  fi
  sleep 2
done
echo "Timed out waiting for postgres/redis" >&2
exit 1
