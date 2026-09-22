# Seminai

Seminai e' una piattaforma software per la gestione agronomica assistita da
intelligenza artificiale. Il backend, il frontend e gli strumenti di automazione
del progetto collaborano per trasformare dati aziendali, documenti tecnici,
etichette, disciplinari, note di campo e storico trattamenti in workflow
operativi verificabili.

Questo README e' il punto di ingresso tecnico per sviluppatori, collaboratori e
agenti software che devono orientarsi nel progetto.

## Missione

Rendere piu' semplice, tracciabile e sicura la gestione agronomica quotidiana:
acquisizione dati, analisi documentale, verifica normativa, pianificazione dei
trattamenti, calcolo dosi, controllo conformita' e supporto conversazionale.

Seminai non sostituisce la responsabilita' tecnica dell'operatore o del
consulente agronomico: organizza le informazioni, automatizza passaggi ripetitivi
e aiuta a motivare le decisioni con dati, fonti e controlli.

## Visione

Costruire un sistema istituzionale per aziende agricole, tecnici e organizzazioni
che hanno bisogno di:

- una base dati agricola coerente tra azienda, campi, magazzini, prodotti,
  patentini, cicli produttivi e lavorazioni;
- agenti AI specializzati, integrati con strumenti reali e non isolati in chat;
- documentazione tecnica e normativa consultabile dal software;
- workflow asincroni robusti per file pesanti, OCR, estrazioni e controlli;
- un frontend operativo, veloce e adatto a uso ripetuto.

## Repository

Il workspace contiene piu' applicazioni collegate:

| Path                          | Ruolo                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `seminai-be-v2/`              | Backend principale: API REST, Socket.IO, Prisma, code BullMQ, agenti AI, integrazioni, test ed eval LLM. |
| `seminai-fe-v3/`              | Frontend web: React, Vite, TanStack Router, React Query, Orval, shadcn/ui, Tailwind CSS.                 |
| `seminai-be-v2/seminai-mcp/`  | Connettore MCP (Seminai + QDC) per Claude e ChatGPT; stdio locale o HTTP su Cloud Run.                   |
| `seminai-be-v2/telegram-bot/` | Bot Telegram per interazione mobile/chat con la piattaforma.                                             |
| `seminai-be-v2/llm-test/`     | Suite promptfoo per valutare prompt, routing tool e qualita' degli agenti LLM.                           |
| `seminai-be-v2/load-test/`    | Script k6 per carico e concorrenza sul Dosage ReAct Agent.                                               |

## Stack Tecnologico

### Backend

- Runtime e linguaggio: Node.js, TypeScript, moduli ESM, `tsx` in sviluppo.
- API: Express, Swagger/OpenAPI, cookie parser, CORS, Helmet, compressione.
- Realtime: Socket.IO con adapter Redis per scenari multi-istanza.
- Persistenza: PostgreSQL con Prisma 7, client generato in
  `src/generated/prisma`.
- Code asincrone: BullMQ su Redis.
- AI e agenti: LangChain, LangGraph, OpenAI/OpenRouter, Anthropic, Tavily,
  Qdrant, promptfoo.
- Documenti e dati: PDF parsing, OCR, CSV/XLSX, Google Cloud Storage,
  integrazioni BDF, MongoDB per percorsi vector legacy.
- Qualita': Jest, ts-jest, ESLint, Prettier, Husky.
- Infra locale: Docker Compose con API, PostgreSQL, Redis, Qdrant, MongoDB e
  MailHog.

### Frontend

- React 19, TypeScript, Vite 8.
- Routing: TanStack Router con route file-based in `src/routes`.
- Server state: TanStack React Query.
- API client: Orval genera client React Query da `swagger.json`; il mutator e'
  `src/lib/api-client.ts`.
- UI: shadcn/ui, Base UI, Tailwind CSS 4, lucide-react, Sonner.
- Tabelle e dati: AG Grid, TanStack Table, Recharts.
- Mappe e campi: Leaflet, React Leaflet, Leaflet Draw.
- Form e validazione: React Hook Form, Zod.
- Realtime: socket.io-client.
- Internazionalizzazione: i18next, react-i18next.

## Avvio Locale

Prerequisiti consigliati:

- Node.js >= 18 per il backend; Node.js 20/22 consigliato per l'intero workspace.
- Docker Desktop o Docker Engine.
- npm.
- Bun solo per alcuni comandi worker/produzione gia' presenti negli script.

### Backend

```bash
cd seminai-be-v2
cp .env.example .env
npm install
docker compose up -d postgres redis qdrant mongodb mailhog
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

Prima delle migrazioni verificare che `DATABASE_URL` punti a un database
esistente. Il `docker-compose.yml` crea un database PostgreSQL con nome legacy;
se si cambia il nome nel `.env`, creare anche il database corrispondente o
allineare `POSTGRES_DB`.

Servizi locali principali:

| Servizio     | URL                              |
| ------------ | -------------------------------- |
| API backend  | `http://localhost:8081`          |
| Swagger UI   | `http://localhost:8081/api-docs` |
| Health check | `http://localhost:8081/health`   |
| MailHog      | `http://localhost:8025`          |
| PostgreSQL   | `localhost:5432`                 |
| Redis        | `localhost:6379`                 |
| Qdrant       | `http://localhost:6333`          |
| MongoDB      | `localhost:27017`                |

### Frontend

```bash
cd seminai-fe-v3
npm install
npm run dev
```

Il frontend parte sulla porta `7177`. In sviluppo Vite inoltra `/api` verso
`http://localhost:8081`, quindi il backend deve essere attivo. Per puntare a un
backend diverso usare `VITE_API_URL`. Se il backend blocca le richieste CORS,
impostare nel `.env` backend `FRONTEND_URL=http://localhost:7177` o includere la
stessa origin in `CORS_ORIGINS`.

## Comandi Backend

```bash
# sviluppo
npm run dev
npm run dev:watch
npm run build
npm start

# database
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run db:dump
npm run db:restore

# test
npm test
npm run test:unit
npm run test:integration
npm run test:int:fast
npm run test:int:llm
npm run test:int:benchmark
npm run test:int:ocr
npm run test:coverage

# qualita'
npm run lint
npm run lint:fix
npm run format:check
npm run format

# docker
npm run docker:up
npm run docker:down
npm run docker:logs

# OpenAPI e frontend codegen
npm run swagger:export
```

## Comandi Frontend

```bash
cd seminai-fe-v3

npm run dev
npm run build
npm run test
npm run lint
npm run type-check
npm run api:generate
npm run generate
```

Note importanti:

- `npm run dev` esegue prima generazione Prisma, codegen API e build dei dataset
  locali.
- `npm run api:generate` esporta Swagger dal backend e rigenera i client Orval.
- Non modificare manualmente `src/generated/api`, `src/generated/schemas` o
  `src/generated/prisma`.

## Architettura Backend

La struttura segue una separazione vicina alla Clean Architecture, con dominio,
use case e infrastruttura separati.

```text
src/
  application/
    services/              # Servizi applicativi condivisi
    use-cases/             # Casi d'uso: auth, aziende, campi, agenti, file, ecc.
  domain/
    dtos/                  # DTO e contratti dati
    entities/              # Entita' di dominio
    repositories/          # Interfacce repository
    services/              # Servizi di dominio
    errors/                # Errori applicativi
  infrastructure/
    http/
      controllers/         # Controller Express
      middlewares/         # Auth, rate limit, socket auth, error handler
      routes/              # Binding route -> controller
      public/              # Asset statici serviti dall'API
    queue/                 # Code BullMQ e worker asincroni
    repositories/          # Implementazioni Prisma e data access
    services/              # AI, OCR, RAG, scraper, integrazioni, mail, tool
    worker/                # Entry point worker
  integration-test/        # Test integrati
  test/                    # Test e fixture di supporto
  generated/               # Codice generato, non editare a mano
```

Punti di ingresso principali:

| File                                        | Scopo                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `src/infrastructure/http/server.ts`         | Avvia Express, Socket.IO, Swagger, middleware e inizializzazione code. |
| `src/infrastructure/http/routes/index.ts`   | Registra tutte le route pubbliche e protette.                          |
| `src/infrastructure/repositories/Prisma.ts` | Istanza Prisma condivisa.                                              |
| `src/infrastructure/worker/worker.ts`       | Avvio worker per code asincrone.                                       |
| `prisma/schema.prisma`                      | Modello dati principale.                                               |
| `src/infrastructure/services/llm-config.ts` | Configurazione modelli LLM.                                            |

## Moduli Funzionali Backend

Le route principali sono montate da `routes/index.ts`:

- autenticazione: `/auth`, `/auth/google`, `/auth/telegram`;
- utenti, aziende e workspace: `/users`, `/companies`, `/user-on-company`,
  `/workspaces`, `/settings`, `/admin`;
- anagrafiche agricole: `/fields`, `/production-units`, `/products`,
  `/warehouses`, `/stocks`, `/machines`, `/patentini`;
- operativita': `/jobs`, `/labels`, `/field-notes`, `/rules`,
  `/conformity-checker`;
- agenti e AI: `/agent-chat`, `/chats`, `/dosage-agent`,
  `/job-verification-agent`, `/field-note-agent`, `/audio-to-text`,
  `/vector-search`;
- documenti e integrazioni: `/files`, `/extractions`, `/disciplinari`, `/bdf`,
  `/scrapegraph`, `/webhooks/whatsapp`, `/webhooks/email`, `/email`;
- sistema: `/health`, `/keep-alive`, `/notifications`, `/mentions`, `/debug`.

## Code Asincrone

Le code sono in `src/infrastructure/queue` e usano BullMQ/Redis. I casi principali
sono:

- estrazione etichette e fertilizzanti;
- calcolo e proposta Dosage Agent;
- verifica conformita';
- creazione job da prodotti;
- estrazione campi, onboarding e file batch;
- vectorizzazione PDF regole/disciplinari;
- cleanup eventi stream e file scaduti;
- outer loop e trigger proattivi degli agenti.

Quando una feature richiede lavoro lungo o fragile, preferire una queue rispetto a
una richiesta HTTP sincrona.

## Agenti AI

Gli agenti vivono in `src/infrastructure/services/agents`:

| Cartella                    | Ruolo                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `dosage_agent_react/`       | Agente conversazionale LangGraph/ReAct con tool, memoria, HITL, socket e working memory. |
| `dosage_agent/`             | Pipeline storica di calcolo dose e validazioni.                                          |
| `chat_dosage_agent/`        | Componenti chat e RAG legati al dosage.                                                  |
| `field_note_agent/`         | Agente per note di campo, prompt e RAG dedicati.                                         |
| `conformity_checker_agent/` | Verifiche di conformita'.                                                                |
| `weather_advisor/`          | Supporto meteo-agronomico.                                                               |
| `file_agent/`               | Estrazione e normalizzazione da file.                                                    |
| `vector_search_agent/`      | Indicizzazione e ricerca vettoriale.                                                     |
| `shared/`                   | Componenti condivisi, inclusi flussi human-in-the-loop.                                  |

Documenti utili:

- `docs/DOSAGE_REACT_AGENT_ARCHITETTURA.md`
- `docs/DOSAGE_REACT_AGENT_FRONTEND_INTEGRATION.md`
- `docs/DOSAGE_AGENT_STREAMING.md`
- `docs/FIELD_NOTE_AGENT_API.md`
- `docs/JOB_VERIFICATION_AGENT_API.md`
- `docs/CONFORMITY_CHECKER_API.md`

## Architettura Frontend

```text
seminai-fe-v3/src/
  api/                    # API manuali o wrapper locali
  components/
    atoms/                # Componenti piccoli riusabili
    molecules/            # Composizioni semplici
    organisms/            # Blocchi funzionali complessi
    templates/            # Layout e strutture pagina
    ui/                   # Componenti shadcn/ui
  config/                 # Navigazione, costanti, opzioni upload
  generated/
    api/                  # Client Orval React Query, non editare
    schemas/              # Schemi generati, non editare
    prisma/               # Client/schema Prisma generato, non editare
  hooks/                  # Hook applicativi e integrazioni realtime
  i18n/                   # Configurazione traduzioni
  lib/                    # API client, socket store, utility infrastrutturali
  pages/                  # Pagine/componenti legacy o compositivi
  providers/              # Provider React, QueryClient
  routes/                 # TanStack Router file-based
  services/               # Client o servizi manuali per flussi speciali
  types/                  # Tipi frontend
  utils/                  # Utility pure
```

Route frontend principali:

- `_auth/login` e `_auth/register`;
- `_dashboard/home`;
- `_dashboard/archivio`;
- `_dashboard/chat`;
- `_dashboard/add-data`;
- `_dashboard/settings`;
- `_dashboard/workspaces/new`;
- `try-seminai`.

Convenzioni frontend:

- usare i client generati da Orval quando esiste l'endpoint;
- usare `src/lib/api-client.ts` per mantenere cookie, errori e 401 coerenti;
- usare React Query per server state;
- usare Socket.IO tramite gli hook/lib gia' presenti;
- mantenere componenti `ui/` allineati a shadcn e lucide-react;
- aggiornare Swagger backend prima di rigenerare API frontend.

## Variabili Ambiente

Partire sempre da `seminai-be-v2/.env.example`. Le aree principali sono:

- server: `PORT`, `NODE_ENV`, `BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGINS`;
- database: `DATABASE_URL`, `DIRECT_URL`;
- auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, OAuth Google, invite code;
- cache/code: `REDIS_URL`, eventuale Upstash;
- LLM: `LLM_GATEWAY`, modelli default/fast/strong/vision/audio,
  `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_API_KEY`;
- storage e ricerca: GCP, Qdrant, Tavily, MongoDB;
- OCR e documenti: Mistral, Datalab, Jina, Formit;
- integrazioni: SMTP/MailHog, WhatsApp Evolution API, SendGrid inbound,
  ScraperGraph, BDF;
- amministrazione: whitelist email e password per route protette.

Non committare `.env`, chiavi, dump sensibili o credenziali operative.

## Database

Il modello dati e' in `prisma/schema.prisma`. Le macro-aree includono:

- utenti, ruoli, autenticazione e impostazioni;
- aziende, workspace e membership;
- campi, unita' produttive, cicli, magazzini, prodotti e stock;
- job agronomici e storico lavorazioni;
- chat, messaggi, sorgenti, eventi streaming e memorie agente;
- estrazioni file, etichette, disciplinari, notifiche e audit.

Le implementazioni repository sono in `src/infrastructure/repositories` e
incapsulano l'accesso Prisma. I contratti di dominio stanno in
`src/domain/repositories`.

## Test, Eval e Qualita'

Test tradizionali:

```bash
npm run test:unit
npm run test:integration
npm run test:int:fast
npm run test:coverage
```

Eval LLM:

```bash
npm run llm-test:eval
npm run llm-test:eval:l2-all
npm run llm-test:eval:p1-all
npm run llm-test:eval:all
npm run llm-test:view
```

Benchmark storico Dosage Agent:

```bash
npm run test:integration -- --testPathPattern="historical-benchmark"
```

La suite usa dati storici dei trattamenti fitosanitari e verifica, tra le altre
cose, ammissibilita', disciplinari, etichetta, dose proposta, deroghe e limiti per
gruppo di sostanze attive.

## Documentazione Interna

La cartella `docs/` contiene specifiche operative gia' utili per sviluppo e
integrazione. Alcuni ingressi consigliati:

- `docs/FRONTEND_INTEGRATION_GUIDE.md`
- `docs/WORKSPACE_AND_RULES_API.md`
- `docs/BATCH_FILE_EXTRACTION_API.md`
- `docs/DISCIPLINARI_EXTRACTION_API.md`
- `docs/FIELD_NOTES.md`
- `docs/EMAIL_INBOUND_CONNECTOR.md`
- `docs/WHATSAPP_INTEGRATION.md`
- `docs/DB_BACKUP_RESTORE.md`
- `docs/RATE_LIMITING.md`
- `docs/HEALTH_AND_WAKEUP_ENDPOINTS.md`

## Indicazioni per Sviluppatori e Agenti

Prima di modificare codice:

1. Leggere questo README e il documento specifico in `docs/`, se esiste.
2. Controllare `routes/index.ts` per capire il punto di ingresso HTTP.
3. Seguire il flusso route -> controller -> use case -> repository/service.
4. Non modificare cartelle generate (`dist`, `coverage`, `src/generated`,
   `seminai-fe-v3/src/generated`).
5. Non introdurre nuove astrazioni se esiste gia' un pattern equivalente.
6. Per nuovi endpoint, aggiornare Swagger e rigenerare il client frontend.
7. Per lavori lunghi, usare BullMQ e notifiche Socket.IO dove serve feedback UI.
8. Per feature AI, aggiungere o aggiornare test/eval promptfoo quando cambia il
   comportamento atteso dell'agente.

Mappa rapida delle modifiche frequenti:

| Obiettivo               | Dove guardare prima                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Nuovo endpoint backend  | `src/infrastructure/http/routes`, `controllers`, `src/application/use-cases`         |
| Nuovo accesso dati      | `src/domain/repositories`, `src/infrastructure/repositories`, `prisma/schema.prisma` |
| Nuova vista frontend    | `seminai-fe-v3/src/routes`, `components`, `hooks`                                    |
| Nuova chiamata frontend | Swagger backend, `npm run api:generate`, `src/generated/api`                         |
| Nuovo job asincrono     | `src/infrastructure/queue`, `src/infrastructure/worker/worker.ts`                    |
| Nuovo tool agente       | `src/infrastructure/services/agents/*/tools` o registry del relativo agente          |
| Configurazione modello  | `src/infrastructure/services/llm-config.ts` e `.env.example`                         |
| Streaming realtime      | Socket middleware, hook frontend `use-socket` / stream dedicati                      |
| Documentazione API      | JSDoc Swagger nelle route e file in `docs/`                                          |

## Sicurezza Operativa

- Le credenziali di produzione, accessi SSH, token Cloud, API key e dump database
  non devono stare nel README o nel repository.
- Usare `.env.example` come contratto pubblico e conservare i valori reali nei
  secret manager o nei file locali esclusi da git.
- Le route protette devono usare middleware di autenticazione/autorizzazione
  coerenti con il resto del progetto.
- I tool agente che modificano dati o possono avere impatto operativo devono
  mantenere controlli, logging e human-in-the-loop dove previsto.

## Licenza

Questo software e' rilasciato con **doppia licenza** (dual license).
Copyright (c) 2024-2026 Francesco Saverio Mazzi <francemazzi@gmail.com>.

Puoi usarlo a tua scelta secondo UNA delle due opzioni seguenti:

1. **GNU AGPL v3** (gratuita) — sei libero di usare, studiare, modificare e
   redistribuire il codice, a condizione che qualsiasi opera derivata che
   distribuisci sia anch'essa rilasciata come open source sotto AGPLv3
   (copyleft). Trattandosi della licenza **Affero**, se esegui una versione
   modificata come servizio di rete (ad esempio come SaaS o servizio web
   ospitato) DEVI rendere disponibile agli utenti di quel servizio anche il
   codice sorgente completo della tua versione modificata (uso via rete, vedi
   Section 13). Testo completo in [`LICENSE`](./LICENSE).

2. **Licenza commerciale** — necessaria per ogni uso che la AGPLv3 non
   consente (prodotti proprietari/closed-source, derivati distribuiti senza
   rilasciarne il sorgente, oppure l'esecuzione di una versione modificata come
   servizio di rete/SaaS senza condividerne il sorgente, ecc.). Per qualsiasi
   uso commerciale o proprietario devi prima **chiedere il permesso** e ottenere
   una licenza scritta dal titolare del copyright:

   **Francesco Saverio Mazzi** — [francemazzi@gmail.com](mailto:francemazzi@gmail.com)

   Dettagli in [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md).
