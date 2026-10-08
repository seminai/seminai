#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required" >&2
  exit 1
fi
docker compose version >/dev/null
docker compose -f compose.yaml up -d --build --wait
echo "Seminai web is ready. Open http://localhost:${SEMINAI_PORT:-8081}/setup"
echo "AI is optional. Data stays in ${SEMINAI_DATA_DIR:-./data}; docker compose down keeps it."
