#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed; health smoke was not executed."
  exit 0
fi
BASE_URL="${BASE_URL:-http://127.0.0.1:8081}"
k6 run --vus 1 --iterations 1 -e BASE_URL="$BASE_URL" "$ROOT/loadtest/health.k6.js"
