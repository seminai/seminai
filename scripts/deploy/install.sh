#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
mkdir -p data/app data/postgres data/redis
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required" >&2
  exit 1
fi
if [ ! -f .env ] && [ -f backend/.env.example ]; then
  cp backend/.env.example .env
  echo "Wrote .env from backend/.env.example"
fi
docker compose -f compose.yaml up -d postgres redis
echo "Postgres and Redis are starting. Build the app image with: docker compose -f compose.yaml build app"
echo "Then start the stack with: docker compose -f compose.yaml up -d"
