# seminai-be-v2 — Backend Rules

Stack: **TypeScript + Express + Prisma + Hexagonal Architecture**

> Shared conventions (file size, no `any`, DRY, English) are in the root `CLAUDE.md`.
> Generate code aligned with the principles below. If a request conflicts, propose the closest compliant alternative.

---

## Naming conventions

| Case       | Used for                                  |
| ---------- | ----------------------------------------- |
| PascalCase | classes, interfaces                       |
| camelCase  | variables, functions, methods, properties |
| kebab-case | file and directory names                  |
| UPPERCASE  | environment variables, constants          |

- Function names begin with a verb.
- Boolean variables prefixed: `isValid`, `hasPermissions`, `canDelete`.
- Void functions prefixed: `execute`, `perform`, `handle`.
- Complete words only. Allowed abbreviations: `API`, `URL`, `DTO`, `HTTP`, `i`/`j` (loops), `err`, `ctx`, `req`/`res`/`next`.

---

## Functions and methods

- Under **20 instructions**, single responsibility.
- No nested conditionals — use early returns or extract helper methods.
- Favor higher-order array methods: `map`, `filter`, `reduce`.
- Arrow functions for simple callbacks (< 3 instructions); named functions for complex logic.
- Use default parameter values instead of explicit `null`/`undefined` checks.
- **RO-RO pattern:** pass multiple params as a single object; return structured objects.
- Single abstraction level per function.
- No blank lines within functions.

---

## Data handling

- Encapsulate data in typed interfaces or domain entities.
- Centralize validation in entities or dedicated validation services.
- Prefer immutability: `readonly` for immutable data, `as const` for constant literals.

---

## Classes and interfaces

- Strict SOLID adherence.
- Composition over inheritance.
- Interfaces as contracts between layers.
- Classes: under 200 instructions, fewer than 10 public methods/properties.
- One export per file.

---

## Analytics (PostHog)

- Emit events via the `IAnalyticsService` port (`getAnalyticsService()` from `infrastructure/services/analytics`). Never import `posthog-node` outside the adapter. All captures are fire-and-forget (must not throw/block).
- `distinctId = req.user.id` (use `buildAnalyticsContext(req)` in controllers). Any new event must be added to `docs/analytics/TAXONOMY.md`.
- Send scalars/enums/ids/counts/violation-codes only — never message bodies, free text, or coordinates.
- New processes must flush on shutdown (`getAnalyticsService().shutdown()`); the worker runs the agent, so its flush is mandatory.

## Error handling

- Use exceptions for unexpected errors.
- Catch only when: resolving an anticipated issue, adding meaningful context, or preventing a crash.
- Otherwise delegate to a global exception handler.

---

## Hexagonal Architecture (strict)

```
src/
├── domain/
│   ├── entities/       # pure business logic
│   ├── dtos/           # API request/response contracts
│   ├── repositories/   # repository interfaces (abstractions)
│   └── errors/         # domain error types
├── application/
│   └── use-cases/      # orchestrate domain + infrastructure
├── infrastructure/
│   ├── repositories/   # Prisma repository implementations
│   ├── controllers/    # Express controllers
│   ├── middlewares/
│   ├── routes/
│   ├── public/
│   └── utils/
├── prisma/             # schema.prisma + seed
└── utils/              # shared utilities
```

**Layer rules:**

- **Domain** — zero dependencies on Express or Prisma. Pure TypeScript.
- **Application** — depends on domain interfaces only (never on infrastructure directly).
- **Infrastructure** — implements domain interfaces; depends on Prisma and Express.
- Cross-layer communication via interfaces defined in the domain.

---

## Testing

Pattern: **Arrange-Act-Assert** for unit/integration, **Given-When-Then** for acceptance.

- Name test variables: `inputX`, `expectedX`, `actualX`.
- Unit tests: domain entities, use-cases, repository interfaces.
- Integration tests: controllers, Prisma repository implementations.
- Use mocks for all external dependencies.

### Commands

```bash
npm test                    # unit tests
npm run test:integration    # integration tests
npx jest <file>             # single file
```

---

## JSDoc (public APIs)

Document all public classes, methods, and interfaces with JSDoc.
