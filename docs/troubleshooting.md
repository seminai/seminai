# Troubleshooting

**Compose is unhealthy.** Check `docker compose -f compose.yaml ps` and
`GET /health`. Prisma needs `sslmode=disable` against the `postgres` hostname.
Redis must be `REDIS_URL=redis://redis:6379`, not Upstash.

**Setup wizard loops.** `SETUP_COMPLETED` and encrypted `InstanceSetting` rows
must agree. Secrets in `data/app/secrets` must remain mode `0600`.

**Chat does nothing.** Confirm Ollama with `npm run test:llm:smoke`. The
gateway must be `ollama` unless a cloud key is configured. Unknown
`LLM_GATEWAY` values crash boot.

**Invite rejected.** Compare the query `invite` with `DATA_DIR/secrets/invite`
or rotate it from Settings → Access.

**Qdrant / OCR / Google login / Tavily / email return 503.** Those features are
optional and respond `feature_not_configured` until configured.
`GET /config/public` lists the flags.

**Hosted CI.** GitHub Actions workflows exist but are explicitly unverified
until a green hosted run is recorded.
