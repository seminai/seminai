#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
docker compose -f compose.yaml pull
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d
echo "Stack updated."
