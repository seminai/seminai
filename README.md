# Seminai

Seminai è un quaderno di campagna open source con gestione del magazzino.
Aziende, appezzamenti, attività, trattamenti, carichi e scarichi si gestiscono manualmente,
senza modelli AI o account cloud. L’AI e i collegamenti a Claude/ChatGPT sono facoltativi.

![Seminai](docs/images/how-it-works.jpg)

## App desktop 1.0.1

La distribuzione desktop è in preparazione come **1.0.1-rc.1**: include Node e PostgreSQL,
con dati nella cartella dell’utente, separati dall’applicazione. Windows, macOS e Linux
hanno build dedicate. Telefono e tablet accedono dall’istanza accesa, abilitando la LAN.

La [release pubblica 1.0.0](https://github.com/seminai/seminai/releases/tag/v1.0.0)
contiene la distribuzione Docker e non gli installer desktop. Verifica gli asset e lo
stato dei collaudi prima di scegliere una versione.

Leggi la [guida desktop e i requisiti di rilascio](docs/releases/1.0.1.md) per build,
backup, importazione Docker, AI opzionale e MCP. Ogni proposta di un assistente viene
registrata solo dopo conferma dentro Seminai.

## Profilo server Docker

Il profilo server esistente mantiene PostgreSQL e Redis. Ollama è facoltativo.

```sh
sh scripts/deploy/install.sh
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d
```

Apri [Seminai](http://127.0.0.1:8081/setup) e crea l’amministratore locale.
Puoi configurare l’intelligenza artificiale successivamente nelle integrazioni.

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
- `packages/mcp`: scoped MCP connector.
- `packages/desktop`: Electron installer, local runtime, backups and tunnel supervisor.
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
