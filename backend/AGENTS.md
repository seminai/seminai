# seminai-be-v2 — Backend

You are a senior TypeScript engineer working on an Express + Prisma backend with strict hexagonal architecture. Follow these rules strictly. If a request conflicts with them, propose the closest compliant alternative.

## Stack

TypeScript, Express, Prisma, hexagonal (ports & adapters) architecture, BullMQ/Redis queues, Socket.IO, AI agents (LangGraph/ReAct).

## Commands

Run all commands from `seminai-be-v2/`:

```bash
npm run dev                  # dev server (port 8081, kills existing process first)
npm run build                # compile TypeScript
npm start                    # run compiled dist/
npm run prisma:generate      # regenerate Prisma client
npm run prisma:migrate       # apply migrations (dev)
npm run seed                 # seed database
npm run swagger:export       # export OpenAPI spec for FE codegen

# Testing
npm test                     # unit tests
npm run test:unit            # unit tests (explicit config)
npm run test:integration     # integration tests (runInBand)
npm run test:int:fast        # fast integration subset
npm run test:int:llm         # LLM integration tests
npm run test:int:ocr         # OCR integration tests
npm run test:coverage        # coverage report
npx jest <file>              # single test file

# Quality
npm run lint
npm run lint:fix
npm run format:check
npm run format

# Docker
npm run docker:up
npm run docker:down
npm run docker:logs
```

## Architecture map

```
src/
├── domain/
│   ├── entities/       # pure business logic, zero Express/Prisma deps
│   ├── dtos/           # API request/response contracts
│   ├── repositories/   # repository interfaces (abstractions)
│   ├── services/       # domain services
│   └── errors/         # domain error types
├── application/
│   ├── use-cases/      # orchestrate domain + infrastructure
│   └── services/       # shared application services
├── infrastructure/
│   ├── http/
│   │   ├── controllers/    # Express controllers
│   │   ├── middlewares/    # auth, rate limit, error handler
│   │   ├── routes/         # route → controller binding
│   │   └── public/         # static assets
│   ├── repositories/       # Prisma repository implementations
│   ├── queue/                # BullMQ queues and workers
│   ├── services/             # AI, OCR, RAG, mail, integrations
│   └── worker/               # async worker entry point
├── integration-test/
├── test/
└── generated/          # DO NOT EDIT — auto-generated code
prisma/
├── schema.prisma       # data model
└── seed.ts
```

### Layer rules (strict)

- **Domain** — pure TypeScript. No Express, no Prisma imports.
- **Application** — depends on domain interfaces only, never on infrastructure directly.
- **Infrastructure** — implements domain interfaces; depends on Prisma and Express.
- Cross-layer communication via interfaces defined in the domain.

## Key entry points

| File                                        | Purpose                                    |
| ------------------------------------------- | ------------------------------------------ |
| `src/infrastructure/http/server.ts`         | Express + Socket.IO + Swagger + queue init |
| `src/infrastructure/http/routes/index.ts`   | All public and protected routes            |
| `src/infrastructure/repositories/Prisma.ts` | Shared Prisma instance                     |
| `src/infrastructure/worker/worker.ts`       | Async queue worker                         |
| `prisma/schema.prisma`                      | Main data model                            |
| `src/infrastructure/services/llm-config.ts` | LLM model configuration                    |

## Functional modules (routes)

Mounted from `routes/index.ts`:

- **Auth:** `/auth`, `/auth/google`, `/auth/telegram`
- **Users & workspace:** `/users`, `/companies`, `/user-on-company`, `/workspaces`, `/settings`, `/admin`
- **Agricultural data:** `/fields`, `/production-units`, `/products`, `/warehouses`, `/stocks`, `/machines`, `/patentini`
- **Operations:** `/jobs`, `/labels`, `/field-notes`, `/rules`, `/conformity-checker`
- **AI agents:** `/agent-chat`, `/chats`, `/dosage-agent`, `/job-verification-agent`, `/field-note-agent`, `/audio-to-text`, `/vector-search`
- **Documents & integrations:** `/files`, `/extractions`, `/disciplinari`, `/bdf`, `/scrapegraph`, `/webhooks/whatsapp`, `/webhooks/email`, `/email`
- **System:** `/health`, `/keep-alive`, `/notifications`, `/mentions`, `/debug`

## Async queues

Queues live in `src/infrastructure/queue` (BullMQ/Redis). Prefer queues over synchronous HTTP for long or fragile work:

- label/fertilizer extraction
- Dosage Agent calculation
- conformity verification
- job creation from products
- field extraction, onboarding, batch files
- PDF vectorization (rules/disciplinari)
- stream cleanup, expired file cleanup
- agent outer loop and proactive triggers

## AI agents

Located in `src/infrastructure/services/agents/`:

| Folder                      | Role                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `dosage_agent_react/`       | Conversational LangGraph/ReAct agent with tools, memory, HITL |
| `dosage_agent/`             | Legacy dosage calculation pipeline                            |
| `field_note_agent/`         | Field note agent with dedicated RAG                           |
| `conformity_checker_agent/` | Conformity checks                                             |
| `weather_advisor/`          | Weather-agronomic support                                     |
| `file_agent/`               | File extraction and normalization                             |
| `vector_search_agent/`      | Vector indexing and search                                    |
| `shared/`                   | Shared components including HITL flows                        |

## Do NOT edit

| Path                 | Regenerate with                  |
| -------------------- | -------------------------------- |
| `src/generated/`     | project-specific codegen scripts |
| Prisma client output | `npm run prisma:generate`        |

Never commit secrets from `.env`.

## TypeScript conventions

### Naming

| Case       | Used for                                  |
| ---------- | ----------------------------------------- |
| PascalCase | classes, interfaces                       |
| camelCase  | variables, functions, methods, properties |
| kebab-case | file and directory names                  |
| UPPERCASE  | environment variables, constants          |

- Function names begin with a verb.
- Boolean variables: `isValid`, `hasPermissions`, `canDelete`.
- Void functions: `execute`, `perform`, `handle`.
- Complete words only. Allowed abbreviations: `API`, `URL`, `DTO`, `HTTP`, `i`/`j` (loops), `err`, `ctx`, `req`/`res`/`next`.

### Functions and methods

- Under **20 instructions**, single responsibility.
- No nested conditionals — use early returns or extract helpers.
- Favor `map`, `filter`, `reduce`. Arrow functions for simple callbacks (< 3 instructions).
- Default parameter values instead of explicit `null`/`undefined` checks.
- **RO-RO pattern:** pass multiple params as a single object; return structured objects.
- Single abstraction level per function.
- No blank lines within functions.
- One export per file.
- Maximum **300 lines per file** — refactor immediately if exceeded.

### Data handling

- Encapsulate data in typed interfaces or domain entities.
- Centralize validation in entities or dedicated validation services.
- Prefer immutability: `readonly` for immutable data, `as const` for constant literals.

### Classes and interfaces

- Strict SOLID adherence.
- Composition over inheritance.
- Interfaces as contracts between layers.
- Classes: under 200 instructions, fewer than 10 public methods/properties.

### JSDoc

Document all public classes, methods, and interfaces with JSDoc.

## Error handling

- Use exceptions for unexpected errors.
- Catch only when: resolving an anticipated issue, adding meaningful context, or preventing a crash.
- Otherwise delegate to the global exception handler.

## Testing

- **Unit/integration:** Arrange-Act-Assert pattern.
- **Acceptance:** Given-When-Then.
- Name test variables: `inputX`, `expectedX`, `actualX`.
- Unit tests: domain entities, use-cases, repository interfaces.
- Integration tests: controllers, Prisma repository implementations.
- Use mocks for all external dependencies.

## Feature roadmaps

| Roadmap                                                                                                        | Scope                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/feature/farmer_roadmap.md`](docs/feature/farmer_roadmap.md)                                             | Commercial viticultural persona — inbox, orders, proforma, DDT                |
| [`docs/feature/workspace_kind_manufacturing_roadmap.md`](docs/feature/workspace_kind_manufacturing_roadmap.md) | Workspace kind (`AGRICULTURAL` / `MANUFACTURING`) + `react_manufacture_agent` |

## Definition of Done

- [ ] Hexagonal layer boundaries respected (domain has zero infra deps)
- [ ] Explicit types everywhere, no `any`
- [ ] File ≤ 300 lines (or split)
- [ ] DRY — existing logic reused before writing new code
- [ ] One export per file, single responsibility per function/class
- [ ] JSDoc on public APIs
- [ ] Tests added/updated when behavior changes
- [ ] Long-running work uses queues, not blocking HTTP
