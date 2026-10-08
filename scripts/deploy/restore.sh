#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
ARCHIVE="${1:?Usage: restore.sh /data/backups/seminai-<timestamp>.tar.gz}"
cd "$ROOT"
docker compose -f compose.yaml stop app
docker compose -f compose.yaml up -d --wait postgres redis
# On failure leave writers stopped; the recovery snapshot is retained.
docker compose -f compose.yaml run --rm --no-deps app node /app/scripts/deploy/server-restore.cjs "$ARCHIVE"
docker compose -f compose.yaml up -d --wait app
