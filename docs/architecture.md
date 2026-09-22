# Architecture

Seminai is a private monorepo: Express + Prisma backend, Vite SPA, MCP
connector, optional Telegram bot. One Node 22 Debian-slim image serves API,
worker, and SPA (`APP_MODE=all` by default).

Runtime dependencies: PostgreSQL 16 and Redis 7. Optional: Ollama, Qdrant,
Mailpit, Tailscale, Cloudflare. Files store on the local disk (HMAC signed
downloads) or S3-compatible storage. GCP/GCS are not used.

The SPA is copied into the image and served by Express when `SPA_DIR` is set.
API routes remain under `/` and `/api`. Instance settings are AES-256-GCM
encrypted with `env > db > default` precedence.

See [`ROADMAP.md`](../ROADMAP.md) for the local-first release ledger.
