#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if docker image inspect seminai:local >/dev/null 2>&1; then
  echo "Image seminai:local already present on this host."
  docker image inspect seminai:local --format '{{.Os}}/{{.Architecture}} {{.Id}}'
  exit 0
fi
if docker buildx version >/dev/null 2>&1; then
  docker buildx build --load -t seminai:local -f Dockerfile .
else
  docker build -t seminai:local -f Dockerfile .
fi
echo "Image seminai:local is available on this host."
