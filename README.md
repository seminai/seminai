# Seminai

Seminai is a local program for a farm or winery. It helps you plan field work,
keep records, and ask an assistant that runs on **your computer**. Your data
stays at home. You do not need a cloud account to start.

![How Seminai works: people and a farm robot in a Mediterranean courtyard](docs/images/how-it-works.jpg)

## What it does

1. You describe the farm in the browser (fields, crops, treatments).
2. A local assistant (Ollama) answers in the same house as your files.
3. Optional extras (email, maps, remote access) stay off until you turn them on.

## Install (no programming needed)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and,
for the assistant, [Ollama](https://ollama.com/). Then open a terminal in this
folder and run:

![Starting Seminai at the farmhouse table](docs/images/how-to-install.jpg)

```bash
sh scripts/deploy/install.sh
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d
```

When Docker shows the app as running, open [http://127.0.0.1:8081/setup](http://127.0.0.1:8081/setup)
in the browser. Create the first administrator, choose **Ollama**, and finish
the wizard. After that, sign in at [http://127.0.0.1:8081](http://127.0.0.1:8081).

More detail: [`docs/install.md`](docs/install.md). If something fails, see
[`docs/troubleshooting.md`](docs/troubleshooting.md).

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
Docker services automatically.

## Docs

- [`docs/install.md`](docs/install.md)
- [`docs/access.md`](docs/access.md)
- [`docs/backup.md`](docs/backup.md)
- [`docs/providers.md`](docs/providers.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/environment.md`](docs/environment.md)
- [`docs/troubleshooting.md`](docs/troubleshooting.md)

## Repository layout

- `backend`: API, workers, agents, queues, Prisma schema, and domain services.
- `frontend`: React/Vite single-page application.
- `packages/mcp`: MCP connector.
- `packages/telegram-bot`: optional Telegram connector.
- `evals`: deterministic evaluation harness.
- `loadtest`: k6 scenarios.
- `e2e`: Playwright specs for the public setup surface.

## Data boundary

Never add user or customer datasets to Git, images, artifacts, logs, or reports. Automated
tests use fabricated fixtures and documented open data. Optional real-data verification may
only read `SEMINAI_FIXTURES_DIR`, an absolute local path outside every repository, and must
not emit fixture names, identifiers, paths, or contents.

## Licensing and security

Seminai is offered under AGPL-3.0-or-later or separately negotiated commercial terms. See
[`LICENSE`](./LICENSE), [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md),
[`DCO.md`](./DCO.md), and [`SECURITY.md`](./SECURITY.md).

GitHub Actions workflows exist under `.github/workflows/` and remain **unverified** on the
hosted runners until a green run is recorded.
