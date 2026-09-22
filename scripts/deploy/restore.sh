#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
ARCHIVE="${1:?Usage: restore.sh <backup.tar.gz>}"
cd "$ROOT"
docker compose -f compose.yaml down
tar -xzf "$ARCHIVE" -C "$ROOT"
docker compose -f compose.yaml up -d postgres
SQL="$(find data/backups -name 'db-*.sql' | sort | tail -n 1)"
if [ -n "$SQL" ]; then
  docker compose -f compose.yaml exec -T postgres psql -U seminai -d seminai < "$SQL"
fi
docker compose -f compose.yaml up -d
echo "Restore complete from $ARCHIVE"
