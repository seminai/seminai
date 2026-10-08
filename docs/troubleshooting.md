# Troubleshooting

**Compose is unhealthy.** Check `docker compose -f compose.yaml ps` and
`GET /health`. Prisma needs `sslmode=disable` against the `postgres` hostname.
Redis must be `REDIS_URL=redis://redis:6379`, not Upstash.

**Setup wizard loops.** `SETUP_COMPLETED` and encrypted `InstanceSetting` rows
must agree. Secrets in `data/app/secrets` must remain mode `0600`.

**Chat is disabled.** New installations start without AI. Configure it in Settings →
Integrations and verify the connection. In Docker, restart `app` after changing
provider settings. Manual journal and warehouse functions remain available.

**Invite rejected.** Compare the query `invite` with `DATA_DIR/secrets/invite`
or rotate it from Settings → Access.

**Qdrant / OCR / Google login / Tavily / email return 503.** Those features are
optional and respond `feature_not_configured` until configured.
`GET /config/public` lists the flags.

**Installer and web verification.** See release notes for the exact source commit
and successful CI runs. Native CI does not replace clean-device acceptance.
