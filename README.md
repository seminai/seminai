# Seminai

Seminai is a local-first, AI-assisted agronomic management platform. This private monorepo
contains the Express/Prisma backend, React frontend, MCP connector, Telegram bot, evaluation
harness, load tests, and installation assets.

## Local development

Requirements: Node.js 22, npm, Docker, and optional Ollama.

```bash
npm ci
npm run codegen
npm run build
npm test
npm run test:integration:fast
npm run test:integration:public
```

PostgreSQL and Redis are required for integration tests. The test commands start isolated
Docker services automatically. Runtime installation and setup instructions will be finalized
in Phases 5-6 of [`ROADMAP.md`](./ROADMAP.md).

## Repository layout

- `backend`: API, workers, agents, queues, Prisma schema, and domain services.
- `frontend`: React/Vite single-page application.
- `packages/mcp`: MCP connector.
- `packages/telegram-bot`: optional Telegram connector.
- `evals`: deterministic evaluation harness.
- `loadtest`: k6 scenarios.

## Data boundary

Never add user or customer datasets to Git, images, artifacts, logs, or reports. Automated
tests use fabricated fixtures and documented open data. Optional real-data verification may
only read `SEMINAI_FIXTURES_DIR`, an absolute local path outside every repository, and must
not emit fixture names, identifiers, paths, or contents.

## Licensing and security

Seminai is offered under AGPL-3.0-or-later or separately negotiated commercial terms. See
[`LICENSE`](./LICENSE), [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md),
[`DCO.md`](./DCO.md), and [`SECURITY.md`](./SECURITY.md).
