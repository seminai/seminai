# Seminai

Seminai è un quaderno di campagna open source con gestione del magazzino.
Aziende, appezzamenti, attività, trattamenti, carichi e scarichi si gestiscono manualmente,
senza modelli AI o account cloud. L’AI e i collegamenti a Claude/ChatGPT sono facoltativi.

![Seminai](docs/images/how-it-works.jpg)

## Scegli come usare Seminai

| Versione | Per chi | Requisiti |
| --- | --- | --- |
| **App desktop** | Vuoi installare e iniziare subito | Installer per Windows, macOS o Linux; servizi inclusi |
| **Web con Docker** | Preferisci il browser o gestisci un server/NAS | Docker Engine/Desktop e Compose v2 sul computer server |

Entrambe offrono lo stesso quaderno e magazzino. L’AI è disattivata nelle nuove
installazioni e si configura, se desiderata, in Impostazioni → Integrazioni.
Telefono e tablet usano il browser dell’istanza accesa; non sincronizzano dati offline.

### App desktop

Gli installer sono nella [release 1.0.1-rc.2](https://github.com/seminai/seminai/releases/tag/v1.0.1-rc.2).
Su macOS scegli i file **`-signed`** per Intel o Apple Silicon: sono firmati e notarizzati.
La firma Windows resta da completare; i collaudi ancora aperti sono nelle note di rilascio.
I dati rimangono nella cartella dell’utente, separati dai binari.

Leggi la [guida desktop](docs/releases/1.0.1.md) per backup, importazione Docker,
AI e MCP. Ogni proposta di un assistente richiede conferma dentro Seminai.

### Web con Docker

Dalla cartella del repository, su Windows (PowerShell), macOS o Linux:

```sh
docker compose up -d --build --wait
```

Apri [Seminai nel browser](http://localhost:8081/setup) e crea l’amministratore.
Non servono Node, PostgreSQL, Redis o Ollama installati sul computer: i tre servizi
necessari (`app`, `postgres`, `redis`) sono gestiti da Compose. Il primo download/build
richiede Internet; il lavoro manuale successivo funziona anche senza connessione.

La configurazione iniziale espone soltanto localhost. Per accesso da altri dispositivi,
porte, aggiornamenti e backup, segui la [guida web Docker](docs/install.md).
I dati persistono in `./data`; `docker compose down` ferma i servizi senza eliminarli.

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

La CI della RC e la matrice installer hanno esecuzioni riuscite. I collaudi manuali
ancora necessari sono indicati nelle [note della RC](docs/releases/1.0.1-rc.2.md).
La pipeline `web-docker` verifica anche avvio, setup senza AI, magazzino, riavvio e ripristino.
