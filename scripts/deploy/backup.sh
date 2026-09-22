#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-$ROOT/data/backups/seminai-$STAMP.tar.gz}"
mkdir -p "$(dirname "$OUT")"
docker compose -f compose.yaml exec -T postgres pg_dump -U seminai seminai > "$ROOT/data/backups/db-$STAMP.sql"
tar -czf "$OUT" -C "$ROOT" data/app data/postgres data/redis "data/backups/db-$STAMP.sql"
echo "Backup written to $OUT"
