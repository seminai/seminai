#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${1:-$ROOT/data/offline/seminai-images.tar}"
mkdir -p "$(dirname "$OUT")"
docker compose -f compose.yaml build app
docker compose -f compose.yaml pull postgres redis
docker save seminai:local postgres:16-bookworm redis:7-bookworm -o "$OUT"
echo "Offline image bundle written to $OUT"
