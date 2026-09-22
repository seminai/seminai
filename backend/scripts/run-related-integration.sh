#!/usr/bin/env bash
#
# Run integration tests related to changed source files only.
# Uses `jest --findRelatedTests` which resolves transitive imports and
# runs only the test files that reach the modified sources.
#
# Scope: diff vs origin/main + unstaged + staged working tree.
# Env overrides:
#   TEST_BASE     - base git ref (default: origin/main)
#   TEST_VERBOSE  - 1 to print resolved file list even when empty
#

set -euo pipefail

cd "$(dirname "$0")/.."

BASE="${TEST_BASE:-origin/main}"
DB_HOST="${SEMINAI_TEST_DB_HOST:-127.0.0.1}"
DB_PORT="${SEMINAI_TEST_DB_PORT:-55432}"
REDIS_HOST="${SEMINAI_TEST_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${SEMINAI_TEST_REDIS_PORT:-56379}"

export NODE_ENV="${NODE_ENV:-test}"
export DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-postgresql://postgres:postgres@${DB_HOST}:${DB_PORT}/seminai_test?schema=public&sslmode=disable}}"
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
export REDIS_URL="${TEST_REDIS_URL:-${REDIS_URL:-redis://${REDIS_HOST}:${REDIS_PORT}}}"
export JWT_SECRET="${JWT_SECRET:-test-jwt-secret-change-me}"
export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-1d}"
export INVITE_CODE="${INVITE_CODE:-TEST_INVITE_CODE}"
export EMAIL_TRANSPORT="json"
export EMAIL_USER="${EMAIL_USER:-noreply@seminai.test}"
export EMAIL_PASSWORD="${EMAIL_PASSWORD:-test-email-password}"
export SMTP_HOST="${SMTP_HOST:-127.0.0.1}"
export SMTP_PORT="${SMTP_PORT:-1025}"

# Intentionally no `git fetch` here: keeps the hook fast and offline-safe.
# If origin/main is stale, run `git fetch origin main` manually before pushing.

collect_changed_files() {
  {
    git diff --name-only "${BASE}"...HEAD -- 'src' 'prisma' 2>/dev/null || true
    git diff --name-only -- 'src' 'prisma' 2>/dev/null || true
    git diff --name-only --cached -- 'src' 'prisma' 2>/dev/null || true
  } | grep -E '\.ts$' | grep -Ev '(\.integration\.test\.ts|\.test\.ts)$' | sort -u
}

CHANGED_FILES=$(collect_changed_files || true)

if [ -z "${CHANGED_FILES}" ]; then
  echo "[test:int:changed] No source changes vs ${BASE} — skipping"
  exit 0
fi

EXISTING_FILES=""
while IFS= read -r file; do
  if [ -n "${file}" ] && [ -f "${file}" ]; then
    EXISTING_FILES="${EXISTING_FILES}${file}"$'\n'
  fi
done <<< "${CHANGED_FILES}"

if [ -z "${EXISTING_FILES}" ]; then
  echo "[test:int:changed] Changed files were deleted or moved — skipping"
  exit 0
fi

echo "[test:int:changed] Changed source files:"
echo "${EXISTING_FILES}" | sed '/^$/d' | sed 's/^/  /'

RELATED_TESTS=$(
  printf '%s' "${EXISTING_FILES}" | tr '\n' '\0' | xargs -0 -r npx jest \
    --config jest.integration.config.cjs \
    --watchman=false \
    --passWithNoTests \
    --listTests \
    --findRelatedTests 2>/dev/null | grep -E '\.integration\.test\.ts$' || true
)

RELATED_COUNT=$(printf '%s\n' "${RELATED_TESTS}" | sed '/^$/d' | wc -l | tr -d ' ')

if [ "${RELATED_COUNT}" = "0" ]; then
  echo "[test:int:changed] No integration tests match the changed sources — skipping"
  exit 0
fi

MAX_RELATED="${MAX_RELATED_TESTS:-8}"
if [ "${RELATED_COUNT}" -gt "${MAX_RELATED}" ]; then
  echo "[test:int:changed] ${RELATED_COUNT} integration tests related (> ${MAX_RELATED})."
  echo "[test:int:changed] You likely touched a core file (Prisma, server, middlewares)."
  echo "[test:int:changed] Skipping smart-run to avoid a very long push. Options:"
  echo "                    - run 'npm run test:int:all' manually"
  echo "                    - raise the threshold with MAX_RELATED_TESTS=<n>"
  echo "                    - bypass with SKIP_INT_CHANGED=1 git push"
  exit 0
fi

echo "[test:int:changed] Running ${RELATED_COUNT} related integration test(s):"
printf '%s\n' "${RELATED_TESTS}" | sed '/^$/d' | sed 's/^/  /'

if [ "${TEST_DRY_RUN:-0}" = "1" ]; then
  echo "[test:int:changed] TEST_DRY_RUN=1 — stopping before running jest"
  exit 0
fi

node scripts/test-env.mjs migrate

# Run tests in small chunks so each chunk gets a fresh Node process.
# Prevents native-state/memory accumulation that crashes jest --runInBand
# when multiple heavy integration files share one process (segfault 139).
CHUNK_SIZE="${TEST_CHUNK_SIZE:-1}"

TESTS_ARRAY=()
while IFS= read -r t; do
  [ -n "${t}" ] && TESTS_ARRAY+=("${t}")
done <<< "${RELATED_TESTS}"

TOTAL=${#TESTS_ARRAY[@]}
CHUNKS=$(( (TOTAL + CHUNK_SIZE - 1) / CHUNK_SIZE ))

for (( i=0; i<TOTAL; i+=CHUNK_SIZE )); do
  CHUNK=( "${TESTS_ARRAY[@]:i:CHUNK_SIZE}" )
  IDX=$(( i / CHUNK_SIZE + 1 ))
  echo "[test:int:changed] Chunk ${IDX}/${CHUNKS} (${#CHUNK[@]} file(s)):"
  printf '  %s\n' "${CHUNK[@]}"
  npx jest \
    --config jest.integration.config.cjs \
    --watchman=false \
    --runInBand \
    --passWithNoTests \
    --forceExit \
    "${CHUNK[@]}"
done
