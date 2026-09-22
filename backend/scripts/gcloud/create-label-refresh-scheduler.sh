#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${LABEL_REFRESH_CRON_SECRET:?Set LABEL_REFRESH_CRON_SECRET}"

REGION="${REGION:-europe-west1}"
BACKEND_SERVICE_NAME="${BACKEND_SERVICE_NAME:-seminai-be-v2}"
JOB_NAME="${JOB_NAME:-seminai-label-refresh}"
SCHEDULE="${SCHEDULE:-0 3 * * *}"
TIME_ZONE="${TIME_ZONE:-Europe/Rome}"
LABEL_REFRESH_TTL_DAYS="${LABEL_REFRESH_TTL_DAYS:-7}"
LABEL_REFRESH_BATCH_LIMIT="${LABEL_REFRESH_BATCH_LIMIT:-50}"

BACKEND_URL="$(
  gcloud run services describe "$BACKEND_SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --format='value(status.url)'
)"

gcloud run services update "$BACKEND_SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --set-env-vars "LABEL_REFRESH_CRON_SECRET=$LABEL_REFRESH_CRON_SECRET,LABEL_REFRESH_TTL_DAYS=$LABEL_REFRESH_TTL_DAYS,LABEL_REFRESH_BATCH_LIMIT=$LABEL_REFRESH_BATCH_LIMIT"

if gcloud scheduler jobs describe "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1; then
  ACTION="update"
else
  ACTION="create"
fi

gcloud scheduler jobs "$ACTION" http "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --schedule "$SCHEDULE" \
  --time-zone "$TIME_ZONE" \
  --uri "$BACKEND_URL/internal/labels/refresh" \
  --http-method POST \
  --headers "X-Cron-Secret=$LABEL_REFRESH_CRON_SECRET,Content-Type=application/json" \
  --message-body "{\"mode\":\"stale\",\"limit\":$LABEL_REFRESH_BATCH_LIMIT,\"dryRun\":false}"

echo "Configured Cloud Scheduler job $JOB_NAME -> $BACKEND_URL/internal/labels/refresh"
