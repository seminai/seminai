#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Pause writers before the database dump and attachment snapshot.
docker compose -f compose.yaml stop app
trap 'docker compose -f compose.yaml start app >/dev/null' EXIT
docker compose -f compose.yaml run --rm --no-deps app node /app/scripts/deploy/server-backup.cjs
