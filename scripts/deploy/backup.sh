#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Pause OAuth state writers too; do not enable an unused MCP profile.
MCP_RUNNING="$(docker compose -f compose.yaml --profile mcp ps --status running --services mcp)"
docker compose -f compose.yaml --profile mcp stop app mcp
resume() {
  docker compose -f compose.yaml start app >/dev/null
  if [ -n "$MCP_RUNNING" ]; then docker compose -f compose.yaml --profile mcp start mcp >/dev/null; fi
}
trap resume EXIT
docker compose -f compose.yaml run --rm --no-deps app node /app/scripts/deploy/server-backup.cjs
