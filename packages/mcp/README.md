# @seminai/mcp-connector

Model Context Protocol (MCP) server that exposes the Seminai REST API and the
mapped Image Line QDC APIs as tools for Claude Desktop, Claude.ai, ChatGPT, and
any other MCP-compatible client.

The connector is a thin, typed wrapper around the existing Seminai backend
([seminai-be-v2](../)). It does not duplicate business logic — every tool maps
to one REST endpoint, with input validation via Zod and error mapping to MCP
tool results. QDC calls go through the backend facade so Image Line tokens
never pass through the MCP client.

---

## Status

Seminai tools (24) plus QDC Image Line tools (read grouped + one tool per write):

- **Catalog wave** (6) — `seminai_list_companies`, `seminai_list_workspaces`,
  `seminai_list_fields`, `seminai_list_production_units`,
  `seminai_list_machines_by_company`, `seminai_list_warehouses_by_company`
- **BDF wave** (5) — `seminai_bdf_list_crops`,
  `seminai_bdf_list_pests_for_crop`, `seminai_bdf_search_products`,
  `seminai_bdf_get_doses`, `seminai_bdf_authorized_crops_for_product`
- **Labels** (1) — `seminai_get_label` with cache → live SIAN cascade.
  `allowLiveSianExtraction` defaults to `false` (cache-only); set it to `true`
  to authorise a live SIAN scrape, which is slow and consumes user credits.
- **Stock & Job** (4) — `seminai_list_my_products`, `seminai_list_my_jobs`,
  `seminai_list_my_verified_jobs`, `seminai_search_mentions`
- **Disciplinari** (4) — `seminai_disciplinari_list`,
  `seminai_disciplinari_search`, `seminai_disciplinari_check_validity`,
  `seminai_disciplinari_expiring_soon`
- **Dosage Proposal** (4) — propose/confirm/reject HITL flow over the dosage
  agent: `seminai_propose_dosage_plan`, `seminai_confirm_dosage_plan`,
  `seminai_reject_dosage_plan`, `seminai_get_proposal_state`.
- **QDC reads** — `qdc_list_companies`, `qdc_get_azienda`, `qdc_get_license`,
  `qdc_get_technicians`, `qdc_get_associations`, `qdc_get_scadenze`,
  `qdc_get_units`, `qdc_get_conferimenti`, `qdc_get_operations`,
  `qdc_get_register_operations`, `qdc_get_giacenze`,
  `qdc_get_warehouse_movements`, `qdc_search_fertilizers`,
  `qdc_get_treatment_register`
- **QDC writes** (require `confirm=true`) — license associations, magazzino
  carico/reso for agrofarmaci and fertilizzanti, enable/assign/create fertilizer.
  These write the official Image Line logbook.

Validated end-to-end against a real backend for every wave that does not
depend on external services (see `live-smoke.integration.test.ts`). The BDF
wave requires BDF auth credentials configured on the backend; locally those
endpoints return 5xx, which the tools surface as `isError` content with the
underlying status. The `seminai_get_label` cascade is verified live for the
cache-hit path and the cache-miss-with-gate path; the live SIAN extraction
path is validated only at unit/integration level to avoid burning user
credits in CI.

---

## Install

```bash
cd seminai-be-v2/seminai-mcp
bun install
bun run build
```

The build emits `dist/cli.js` (stdio) and `dist/http.js` (Streamable HTTP).
Tests are excluded from the production build (`tsconfig.build.json`).

---

## Configure

Stdio (Claude Desktop local) requires:

| Variable               | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `SEMINAI_API_BASE_URL` | Base URL of the Seminai backend (e.g. `http://localhost:8081`).                        |
| `SEMINAI_API_TOKEN`    | JWT obtained from `POST /auth/login`. The MCP server makes every request as this user. |

Remote HTTP additionally requires:

| Variable                | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| `PUBLIC_BASE_URL`       | Public origin of this MCP server (no trailing slash). Used in OAuth metadata. |
| `MCP_OAUTH_SIGNING_KEY` | HMAC secret (≥16 chars) for the login cookie. Store in Secret Manager.        |
| `PORT`                  | Listen port. Cloud Run injects `PORT` automatically.                          |

Optional:

| Variable                       | Default   | Notes                                                                       |
| ------------------------------ | --------- | --------------------------------------------------------------------------- |
| `SEMINAI_MCP_SERVER_NAME`      | `seminai` |                                                                             |
| `SEMINAI_MCP_SERVER_VERSION`   | `0.0.1`   |                                                                             |
| `SEMINAI_MCP_HTTP_TIMEOUT_MS`  | `30000`   | Default HTTP timeout for read/CRUD tools.                                   |
| `SEMINAI_MCP_AGENT_TIMEOUT_MS` | `180000`  | Longer timeout reserved for `/agent-chat/*` (propose/confirm/reject/state). |

See `.env.example` for the full list.

### Compact mode on list tools

To keep agent context small, `seminai_list_production_units` and `seminai_list_my_products`
default to `compact=true`: a thin projection with the essential fields only
(`id`, `name`, `cropName/category`, key dates/stockTotal, company/warehouse). Pass
`compact=false` from the agent to receive the full backend payload (large — may
saturate context for non-trivial workspaces).

---

## Use with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "seminai": {
      "command": "node",
      "args": ["/absolute/path/to/seminai-be-v2/seminai-mcp/dist/cli.js"],
      "env": {
        "SEMINAI_API_BASE_URL": "http://localhost:8081",
        "SEMINAI_API_TOKEN": "<jwt-from-/auth/login>"
      }
    }
  }
}
```

Restart Claude Desktop. Tools should appear under the `seminai` connector.

---

## Use as a remote connector (Claude.ai and ChatGPT)

The same package also serves Streamable HTTP + OAuth 2.1 (PKCE S256, Dynamic
Client Registration, RFC 9728 resource metadata):

```bash
PUBLIC_BASE_URL=http://localhost:8080 \
MCP_OAUTH_SIGNING_KEY=change-me-to-a-long-random-secret \
SEMINAI_API_BASE_URL=http://localhost:8081 \
bun run dev:http
```

- Health: `GET /healthz`
- MCP: `POST/GET/DELETE/HEAD /mcp`
- OAuth: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`,
  `/oauth/authorize`, `/oauth/token`, `/oauth/register`

**Claude.ai / Claude Desktop custom connector:** Settings → Connectors → Add custom
connector → `https://<PUBLIC_BASE_URL>/mcp`. Claude runs the OAuth login against
Seminai (`POST /auth/login`).

**ChatGPT (Plus/Pro, Developer mode):** Settings → Apps/Connectors → add a remote
MCP server with the same URL. The first protected tool call starts OAuth.

Do not put Cloud Run / IAP in front of this service. Ingress must be public;
authentication is OAuth at the application layer.

### Publish on Google Cloud Run (project `seminai`)

```bash
cd seminai-be-v2/seminai-mcp
chmod +x deploy/create-secrets.sh deploy/cloudrun.sh
./deploy/create-secrets.sh
./deploy/cloudrun.sh
```

Deploys service `seminai-mcp` to `europe-west1` (same region as `seminai-be-v2`),
`--allow-unauthenticated`, session affinity, 300s timeout, **max 1 instance**
(OAuth codes and MCP sessions are in-memory). Then set `PUBLIC_BASE_URL` to the
printed `*.run.app` URL (or a custom domain) and redeploy so OAuth `aud` /
metadata match.

---

## Develop

```bash
bun run dev               # tsx --watch src/cli.ts
bun run type-check        # tsc --noEmit (full project)
bun run build             # tsc -p tsconfig.build.json (excludes tests)
bun run test:unit         # jest unit tests
bun run test:integration  # jest integration tests (in-memory MCP + fake HTTP)
bun run test:all          # unit + integration
```

### Test layout

- `src/__tests__/**` — unit tests (handler logic, HTTP client, config).
- `src/integration-test/**` — integration tests:
  - `server-boot.integration.test.ts` spawns the real CLI binary.
  - `http-client.integration.test.ts` exercises the HTTP client against a
    `node:http` server bound to a random local port.
  - `mcp-tools.integration.test.ts` connects an MCP `Client` to the server via
    `InMemoryTransport` and calls each tool against a fake backend.
  - `live-smoke.integration.test.ts` (env-gated) authenticates against a real
    Seminai backend and exercises the Catalog wave end-to-end.

### Running the live smoke test

```bash
SEMINAI_LIVE_TEST=1 \
SEMINAI_LIVE_BASE_URL=http://localhost:8081 \
SEMINAI_LIVE_EMAIL='you@example.com' \
SEMINAI_LIVE_PASSWORD='your-password' \
bun run test:integration
```

The test logs in via `POST /auth/login`, builds an MCP server bound to the
returned JWT, and exercises the Catalog, Labels, Stock/Job, Disciplinari and
Dosage Proposal waves. The Dosage Proposal block stays in the **safe** path
(propose → state → reject); it does not persist treatment jobs.

To also exercise the **full propose → confirm cycle** (which persists jobs to
the DB), add a second gate and provide a realistic prompt referencing a
production unit and product available on the test account:

```bash
SEMINAI_LIVE_TEST=1 \
SEMINAI_LIVE_DESTRUCTIVE_TEST=1 \
SEMINAI_LIVE_DOSAGE_MESSAGE='Calcola trattamenti per UP "Frumento Bologna" con prodotto Karate Zeon' \
SEMINAI_LIVE_BASE_URL=http://localhost:8081 \
SEMINAI_LIVE_EMAIL='you@example.com' \
SEMINAI_LIVE_PASSWORD='your-password' \
bun run test:integration
```

The destructive block proposes, asserts `REQUIRES_APPROVAL` on
`create_treatment_jobs` with a structured `proposalSummary`, confirms, then
re-confirms to validate idempotency via the backend's `queueJobId`.

---

## Architecture

```text
src/
├── cli.ts                    # stdio entry — local Claude Desktop
├── http.ts                   # Streamable HTTP + OAuth entry — Cloud Run
├── http-config.ts            # env for the remote server
├── server.ts                 # createSeminaiMcpServer + registerAllTools
├── config.ts                 # Zod-validated env parsing (stdio)
├── oauth/                    # OAuth 2.1 AS (PKCE, DCR, login via Seminai)
├── http/                     # Express app + Streamable HTTP transport
├── client/
│   ├── http.ts               # SeminaiHttpClient (Bearer auth + timeout)
│   └── http-errors.ts        # Typed error hierarchy
└── tools/
    ├── types.ts              # ToolRegistrar, jsonContent, errorContent
    ├── index.ts              # registerAllTools — Seminai + QDC waves
    └── qdc/                  # Image Line Quaderno di Campagna tools
```

Adding a new tool is mechanical: write a handler that calls
`SeminaiHttpClient`, wrap it in a `ToolRegistrar`, and append the registrar to
`REGISTRARS` in `tools/index.ts`. Add a unit test against a mocked client and,
if it adds a new endpoint shape, an integration test against the fake
backend.
