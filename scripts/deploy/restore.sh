#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
ARCHIVE="${1:?Usage: restore.sh /data/backups/seminai-<timestamp>.tar.gz}"
cd "$ROOT"
MCP_RUNNING="$(docker compose -f compose.yaml --profile mcp ps --status running --services mcp)"
docker compose -f compose.yaml --profile mcp stop app mcp
docker compose -f compose.yaml up -d --wait postgres redis
# On failure leave writers stopped; the recovery snapshot is retained.
docker compose -f compose.yaml run --rm --no-deps app node /app/scripts/deploy/server-restore.cjs "$ARCHIVE"
docker compose -f compose.yaml up -d --wait app
if [ -n "$MCP_RUNNING" ]; then docker compose -f compose.yaml --profile mcp up -d --wait mcp; fi
