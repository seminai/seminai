#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
VERSION="v0.1.0-rc.1"
DEST="$ROOT/artifacts/rc/$VERSION"
rm -rf "$DEST"
mkdir -p "$DEST/deploy" "$DEST/docs"
cp compose.yaml Dockerfile "$DEST/"
cp scripts/deploy/install.sh scripts/deploy/backup.sh scripts/deploy/restore.sh \
  scripts/deploy/update.sh scripts/deploy/offline-build.sh scripts/deploy/compose-smoke.sh \
  "$DEST/deploy/"
cp docs/install.md docs/access.md docs/backup.md docs/providers.md \
  docs/architecture.md docs/environment.md docs/troubleshooting.md \
  docs/release-notes-v0.1.0-rc.1.md "$DEST/docs/"
cp README.md ROADMAP.md "$DEST/"
if [ -f artifacts/sbom.cdx.json ]; then
  cp artifacts/sbom.cdx.json "$DEST/sbom.cdx.json"
else
  node scripts/generate-sbom.mjs
  cp artifacts/sbom.cdx.json "$DEST/sbom.cdx.json"
fi
if docker image inspect seminai:local >/dev/null 2>&1; then
  docker image inspect seminai:local --format '{{.Id}} {{.Os}}/{{.Architecture}}' \
    > "$DEST/image-id.txt"
fi
(
  cd "$DEST"
  find . -type f ! -name 'SHA256SUMS' -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
)
echo "RC bundle written to $DEST"
echo "No GitHub release, tag, or visibility change was performed."
