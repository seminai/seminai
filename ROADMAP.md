# Seminai Open-Source Roadmap

Seminai is an AI-assisted agronomic management platform (TypeScript / Express / Prisma /
LangGraph backend, React / Vite frontend). This roadmap turns the two private repositories
(`seminai-be-v2`, `seminai-fe-v3`) into one open-source monorepo modelled on
[open-legal-products/mike](https://github.com/open-legal-products/mike), designed to run on
an ordinary computer or a NAS and to be reachable by invited team members from anywhere.

Legend: `- [ ]` todo, `- [x]` done. Every phase ends with a **Done when** gate; do not start
the next phase until the gate passes. Sizes: S (< 1 day), M (1-3 days), L (3-7 days).

| Phase | Name                                              | Size | Before going public?             |
| ----- | ------------------------------------------------- | ---- | -------------------------------- |
| 0     | Bootstrap + urgent security actions               | S    | Hard prerequisite                |
| 1     | Import into monorepo layout + purge               | M    | Hard prerequisite                |
| 2     | Private fixtures split                            | S    | Hard prerequisite                |
| 3     | Scrub, hygiene, licence, README                   | M    | Hard prerequisite -> PUBLISHABLE |
| 4     | Self-hostable backend: ports + single-process     | L    | Required                         |
| 5     | First-run wizard + runtime settings + env checks  | L    | Required                         |
| 6     | One-command install on computer or NAS            | L    | Required -> SELF-HOSTABLE        |
| 7     | Remote access bridge + invitations                | M    | Required -> TEAM-READY           |
| 8     | AI providers + chat model picker                  | L    | Required -> MIKE LEVEL           |
| 9     | CI, images, e2e, docs                             | M    | Minimal CI + images required     |
| 10    | Go public                                         | S    | The flip                         |
| 11    | Post-public backlog                               | -    | Can follow                       |

## Definition of done (mike level, NAS-first)

Target hardware: Synology or QNAP NAS (4 GB RAM or more), Unraid, a mini PC or Mac mini,
Raspberry Pi 5 (8 GB), or any laptop with Docker Desktop. No cloud account required.

A newcomer installs it in one of two ways:

```bash
# Mac / Linux / mini PC
curl -fsSL https://raw.githubusercontent.com/seminai/seminai/main/install.sh | sh
# NAS: Container Manager (Synology) or Container Station (QNAP) -> new project -> paste docker-compose.yml
```

and then opens `http://<host>:3000`, where a setup wizard asks, in order: admin account,
AI provider (Anthropic, OpenAI, OpenRouter, or Ollama on this or another computer) with its
key, how people will access Seminai (this network only / stable public link via Tailscale /
own domain via Cloudflare), optional email. Everything is stored in the database; no file is
edited by hand.

Observable end state:

- Default stack is three containers (`app`, `postgres`, `redis`) from prebuilt multi-arch
  images; idle RAM under 1.5 GB; all persistent data under one `./data` folder that a NAS
  can back up with its own tools.
- Workspaces, companies, fields, products, machines, jobs, chat with the agronomic agent,
  file uploads (local disk), background jobs (inline worker), API docs at `/api-docs`.
- Settings > Access shows the LAN URL, the public URL, a QR code and tunnel health; invite
  links and QR codes are shareable without SMTP; invited users open the link, register with
  the pre-filled email and land in the workspace.
- AI provider switchable at runtime; chat model picker fed by `GET /llm/models`. A local
  model server is entered as a URL (or auto-detected): if Ollama is already running on the
  host, the sidecar or another LAN machine, the wizard and Settings > AI show it as
  "detected" with its live model list; LM Studio, llama.cpp server or vLLM work the same way
  as an OpenAI-compatible URL.
- One-click backup (database + uploads) and one-command update (`docker compose pull`).
- Features that stay dark until configured, shown as "not configured" instead of crashing:
  OCR (Mistral or Datalab), agent web search (Tavily), Google login, WhatsApp (Evolution),
  inbound email (SendGrid), speech-to-text, rules/disciplinari RAG (Qdrant), commercial
  datasets (BDF, QDC Image Line), PostHog, Langfuse.
- Licence: AGPL-3.0 with a commercial option; contributions under DCO.

## Decisions

Taken:

- Fresh git history; the old private repos become read-only archives. Purging happens by
  excluding at copy time (Phase 1), never by "commit then delete".
- Dual licence kept: `LICENSE` (AGPL-3.0), `COMMERCIAL-LICENSE.md`, `legal/`,
  `CONTRIBUTING.md` with DCO.
- Scope: backend, frontend, `packages/mcp`, `packages/telegram-bot`, `evals/`, `loadtest/`,
  `backend/studio/`. The Astro marketing hub stays out.
- One application image `ghcr.io/seminai/seminai` = API + inline worker + built SPA
  (`APP_MODE=all|api|worker`); Debian-slim base; linux/amd64 + linux/arm64. Separate
  worker and frontend containers remain available for scaled deployments.
- `STORAGE_DRIVER=local` default (uploads under `./data/uploads`, served through a signed
  download route); `s3` (MinIO or any S3) and `gcs` optional.
- MongoDB removed entirely. Qdrant, Ollama, Mailpit, Tailscale, Cloudflare are Compose
  profiles.
- Runtime configuration lives in the database (`InstanceSetting` key/value, secrets
  encrypted with an auto-generated `APP_ENCRYPTION_KEY`); environment variables are
  defaults and overrides for advanced users. Precedence: env override > DB > env default.
- Network bridge: Tailscale Funnel sidecar is the recommended stable public URL (no domain,
  no port forwarding, automatic TLS); Cloudflare named tunnel for owners of a domain;
  Cloudflare quick tunnel only as ephemeral demo mode; LAN-only as default.
- Local models: providers `ollama` and `openai-compatible` take a base URL; Ollama is
  auto-detected at `http://host.docker.internal:11434`, `http://ollama:11434` and
  `http://localhost:11434`; model lists come live from `/api/tags` or `/v1/models`, with
  tool-calling capability flagged so the agent never silently picks a model without it.
- When a public URL is active: registration is invite-only, login has rate limit and
  lockout, cookies are `secure`, HSTS is on, `trust proxy` is set.
- npm workspaces at the root with one `package-lock.json`; `bun.lock` files dropped.
- Private test data moves to `seminai/seminai-fixtures`, resolved through
  `SEMINAI_FIXTURES_DIR`; tests skip when absent.
- All documentation in English; existing 300-line and no-`any` rules stay.

Open (decide before the phase that references them):

- Embeddings provider: OpenAI `text-embedding-3-small` (1536 dims) or Ollama
  `nomic-embed-text` (768 dims); affects Qdrant collection dimensions (Phase 8).
- `dataset/fitosanitari` (18 MB Ministry open data): commit or fetch at first run (Phase 1).
- Container runtime for `dist/`: keep Bun or move to Node 22 (Phase 6).
- Optional TOTP two-factor login for public deployments (Phase 11, `speakeasy` is already
  a dependency but unused).

## Target layout

```text
seminai/
  backend/            # seminai-be-v2: src, prisma, dataset (clean subset), scripts, studio/, langgraph.json
  frontend/           # seminai-fe-v3 SPA (Vite), without marketing/ and landingpage_html/
  packages/
    mcp/              # @seminai/mcp-connector, HTTP-only
    telegram-bot/     # HTTP-only client
  evals/              # promptfoo suites (from llm-test), imports prompts from ../backend/src
  loadtest/           # k6 scripts
  e2e/                # Playwright smoke suite (new, Phase 9)
  docker/             # app.Dockerfile, entrypoint.sh, compose fragments for profiles
  installer/          # install.sh, synology/, qnap/, unraid/ templates and screenshots
  docs/               # install/, remote-access, backup-restore, ai-providers, architecture, env-reference
  scripts/            # generate-openapi, sync datasets, fetch-open-data, backup, restore
  legal/              # commercial licence agreement template
  docker-compose.yml         # prebuilt images, default 3 containers + profiles
  docker-compose.build.yml   # build from source (contributors)
  docker-compose.dev.yml     # hot reload
  docker-compose.test.yml
  .env.example  package.json (workspaces)  package-lock.json  ROADMAP.md  README.md
```

---

## Phase 0 - Bootstrap + urgent security actions (S)

Out of band, regardless of the rest of this roadmap:

- [ ] URGENT: revoke the GCP service-account key tracked as `seminai-be-v2/key_gcp.json`
      (in git since commit `ce77dc8`, 2025-10-10); issue a new key for production and store
      it only in the deployment secret manager.
- [ ] URGENT: disable public listing on bucket `seminai_bucket_1`; keep object-level reads
      working until Phase 4 replaces public URLs with signed URLs.
- [ ] Rotate every credential in the two working trees' `.env` files that was ever committed
      (frontend `.env` and `.env.production` are tracked).

Repository bootstrap:

- [x] `git clone https://github.com/seminai/seminai.git` into `seminai_core/seminai/`.
- [x] Add this `ROADMAP.md` as the first and only commit on `main`.

**Done when**: key revoked (confirmed in IAM), bucket not publicly listable, `seminai/`
contains exactly `ROADMAP.md` on `main`.

## Phase 1 - Import into monorepo layout + purge (M)

Copy only git-tracked files (`git -C ../seminai-be-v2 ls-files`, same for the frontend)
through an exclusion list. Never `cp -r` the working trees: they hold untracked production
dumps (`backups/prod_supabase_*.sql`), `extraction/`, `.env`.

Backend exclusions, never copied:

- [ ] `key_gcp.json`, `lsof`, `npm`, `seminai-be-v2@1.0.0`, `openapi-extract-api.json`,
      `bun.lock`, `seminai-mcp/bun.lock`, `seminai-mcp/endpoints-candidates.json`,
      `deploy-worker.sh`, `telegram-bot/deploy.sh`, `seminai-mcp/deploy/`, `.gcloudignore`,
      `docker-compose.prod.yml`.
- [ ] `dataset/user/`, `dataset/bdf/`, `dataset/dataset_trattamenti/`, `dataset/test/`,
      `dataset/ddt_pdf/`, `dataset/sisco_lombardia/CUAA_AZIENDA_UPLOADcsv`,
      `dataset/dataset_crop_phases/*.pdf` (BBCH monographs, copyright),
      `dataset/disciplinari_pdf/`, `prisma/data_seed/LabelExtraction_rows.csv`.
- [ ] Review before copying: `dataset/groundTruth/label.json` (6 bucket URLs),
      `src/infrastructure/http/public/developer/`.
- [ ] Confidential docs: `docs/ROADMAP_FALL_RFS_YC_2026.md`, `docs/bdf/`,
      `docs/feature/*roadmap*.md`, `docs/feature/p2-dosage-react-stabilization.md`.
      Ops docs (`DB_BACKUP_RESTORE`, `KEEP_ALIVE_SERVICE`, `ASYNC_JOBS_SETUP`, `GITHUB_PAGES`,
      `COMPRESSION_STATUS`, `REDIS_COMPRESSION`, `WORKSPACE_KIND_ROLLOUT`) and the GitHub
      Pages site (`docs/{index.html,styles.css,llms.txt,robots.txt,sitemap.xml,.nojekyll}`)
      go to a private ops repo.
- [ ] Tests, configs and scripts coupled to private data (populated in Phase 2):
      `src/test/{veneto-pcg-zip-parser,preclassify-zip-inspector,pcg-geojson-parser,extract-brogliaccio,shapefile-parser,csv_agent_multirow_headers,header_detector}.test.ts`,
      `src/integration-test/boscarato-dosage/` and the ~20 other private-data integration
      tests, `jest.integration.{boscarato,quality,benchmark,ocr}.config.cjs`,
      `scripts/e2e-batch.ts`, `scripts/smoke-test-document-classifier.ts`,
      `scripts/export-qdc-user-dataset/`, `scripts/export-invoice-edit-dataset.ts`,
      npm scripts `dataset:export-qdc-boscarato`, `dataset:build-catasto`.

Frontend exclusions, never copied:

- [ ] `.env`, `.env.production`, `.tanstack/`, `swagger.json`, `landingpage_html/` (12.9 MB),
      `public/try-seminai/` (8.4 MB), `dist/`, `marketing/`, `scripts/sync-prisma-schema.mjs`.
- [ ] Re-encode the six 2-3.6 MB PNGs in `public/` to WebP (< 300 KB each) or drop them;
      `public/datasets/*.json` stays committed.

Layout and workspace wiring:

- [ ] Root `package.json` with `"workspaces": ["backend", "frontend", "packages/*", "evals"]`,
      root scripts `dev`, `build`, `lint`, `test`, `api:generate`; single root lockfile.
- [ ] Root `.gitignore` (includes `data/`), `.editorconfig`, `.prettierrc`; husky at the
      root: pre-commit lint-staged, pre-push unit tests for backend, frontend, packages/mcp.
- [ ] Rewire couplings: frontend `prisma:generate` runs
      `prisma generate --schema ../backend/prisma/schema.prisma`; `sync-crop-catalog.mjs`
      reads `../backend/dataset/crop_family/crop.json`; root `api:generate` runs backend
      `swagger:export` into `backend/openapi/openapi.json` (committed) and
      `frontend/orval.config.ts` reads it.
- [ ] `evals/`: own `package.json` (promptfoo); imports become `../backend/src/...`; move the
      `llm-test:*` npm scripts out of `backend/package.json`.
- [ ] `packages/mcp`: keep `@seminai/mcp-connector`; `packages/telegram-bot`: `.env.example`
      points at `http://localhost:8081`.
- [ ] Rename the Prisma database from `auth-boiler-plate` to `seminai` everywhere.

**Done when**: `npm ci && npm run build && npm run lint && npm run test` succeed from the root
for backend, frontend and packages/mcp; `git ls-files` shows no `dataset/user`, no
`key_gcp.json`, no `.env*` except `.env.example`; repo size below 60 MB.

## Phase 2 - Private fixtures split (S)

- [ ] Create private repo `seminai/seminai-fixtures` with the excluded datasets and the moved
      tests and scripts, mirroring the old paths.
- [ ] Add `backend/src/test/helpers/fixtures.ts` exporting `fixturesDir()` (reads
      `SEMINAI_FIXTURES_DIR`) and `describeWithFixtures()` = `describe.skip` when unset.
- [ ] Tests left in the open repo touch only the clean subset (`crop_family`, `fitosanitari`,
      `agea`, `fertilizer_plan`, `label_pdf`, `sisco_lombardia/lombardia_sisco_utilizzi_2025.csv`).
- [ ] `backend/jest.integration.private.config.cjs` loading tests from
      `$SEMINAI_FIXTURES_DIR/tests/**`; document `npm run test:int:private`.
- [ ] Grep gate (also in CI): `grep -rn "dataset/user\|boscarato\|dataset/bdf" backend/src` is empty.

**Done when**: `npm test` passes without `SEMINAI_FIXTURES_DIR`; with it set, the private
suite runs; `git grep -i` finds no customer name, P.IVA, CF or PEC.

## Phase 3 - Scrub, hygiene, licence, README -> PUBLISHABLE (M)

Hard-coded internal references to configuration:

- [ ] `backend/src/infrastructure/http/swagger.ts:13` and `swagger-extract-api.ts:14`:
      server URL from the resolved public URL, default `http://localhost:8081`.
- [ ] `EmailRepository.ts:5` (`get.seminai@gmail.com`) and `EmailService.ts:189`
      (`noreply@seminai.tech`): use `EMAIL_FROM`, no personal fallback.
- [ ] `email-ingestion/templates/*` and `.env.example:128-134`: `https://app.seminai.app`
      -> resolved public URL; `SettingsController.ts:426` and frontend
      `settings-integrations-section.tsx:355,430` -> `EMAIL_INBOUND_DOMAIN`, empty means
      "not configured".
- [ ] `prisma/seed.ts:240,308` and `prisma/seed/seed-skills-standalone.ts:8`: remove the
      personal admin email; seed only reference data.
- [ ] `package.json` author fields -> `Seminai contributors` + repository URL.
- [ ] Tests asserting on real hostnames (`cors-policy.test.ts`, `email-inbound-*.test.ts`)
      use `example.com`.
- [ ] `.env.example:49-50` use `https://app.example.com`; drop dead vars `FORMIT_API_URL`,
      `JINA_API_KEY`, `DOTS_OCR_BASE_URL`, `GCP_API_KEY`, `MONGO_DB_*`, `IMAGE_LINE_API_KEY`;
      remove dependency `duck-duck-scrape`.
- [ ] Hostname sweep over `docs/backend/*.md`, `CLAUDE.md`, `AGENTS.md`, `.cursor/` rules:
      replace `*.run.app`, `seminai.tech`, `seminai.app`, `seminai.it`, Tailscale IPs.
- [ ] Run `gitleaks detect --no-git` and `trufflehog filesystem .`; add a gitleaks pre-commit hook.

Licence and community files at the root:

- [ ] `LICENSE` (AGPL-3.0), `COMMERCIAL-LICENSE.md`, `legal/COMMERCIAL-LICENSE-AGREEMENT.md`,
      `CONTRIBUTING.md` (DCO), `CODE_OF_CONDUCT.md`, `SECURITY.md`, `NOTICE` listing bundled
      open data (Ministry fitosanitari, AGEA, SISCO) with their licences.
- [ ] Root `README.md` in mike style: what it is, screenshots, install (Phase 6 commands,
      marked "coming soon" until then), supported hardware, access modes, provider matrix,
      architecture diagram, licence. Per-workspace `README.md` reduced to dev notes.

**Done when**: `git grep -n -i -E "seminai\.(tech|app|it)|run\.app|gmail\.com|100\.[0-9]+\."`
returns only README/SECURITY contact lines; gitleaks clean; a cold reviewer finds no customer,
partner or vendor name. Tag `v0.1.0-alpha.1` (still private).

## Phase 4 - Self-hostable backend: infrastructure ports + single-process mode (L)

Storage:

- [ ] Audit Prisma columns that store `storage.googleapis.com` URLs (labels, files, profile
      images) and design read-time URL resolution before touching call sites.
- [ ] `backend/src/domain/ports/IFileStorage.ts` (`upload`, `delete`, `getReadUrl` signed
      with TTL, `exists`, `list(prefix)`); drivers
      `infrastructure/storage/{LocalDiskFileStorage,S3FileStorage,GcsFileStorage}.ts`.
      Local driver stores under `DATA_DIR/uploads/<tenant>/...` and serves through
      `GET /files/:id?sig=...&exp=...` (HMAC with `APP_ENCRYPTION_KEY`).
- [ ] `infrastructure/storage/createFileStorage.ts` keyed by `STORAGE_DRIVER=local|s3|gcs`
      (default `local`); replace the 28 `new FileService(userId)` call sites in 30 files,
      including the module-scope one in `workspace.routes.ts:99`; delete `FileService.ts`.
- [ ] Remove `bucket.iam.setPolicy(allUsers)` and the four hard-coded
      `https://storage.googleapis.com/...` builders; move
      `scripts/cleanup/cleanupInvalidGcsLabels.ts` to the ops repo.

Processes, queues and cache:

- [ ] `APP_MODE=all|api|worker` (default `all`): when `all`, `server.ts` also boots the
      queue workers from `infrastructure/worker/worker.ts` in-process; `SKIP_QUEUE` removed.
- [ ] `queue/redis.connection.ts`: always prefer `REDIS_URL`; Upstash REST only when
      `UPSTASH_REDIS_REST_URL` is set, never implied by `NODE_ENV=production`.
- [ ] `queue-keepalive.service.ts` behind `QUEUE_KEEPALIVE_ENABLED=false` (Cloud Run only).
- [ ] Static SPA served by Express from `DATA_DIR`-independent `public/app` with SPA fallback
      (pattern already at `server.ts:118-121`); `/api-docs`, `/health`, `/files` excluded
      from the fallback.

Email:

- [ ] `EmailService.ts`: generic SMTP transport from `SMTP_HOST/PORT/USER/PASS/SECURE` +
      `EMAIL_FROM`; Gmail becomes plain SMTP settings; `transporter.verify()` warns instead of
      throwing; `EMAIL_DRIVER=smtp|none`; every email-sending use case is optional when
      `none` (invitations fall back to shareable links, Phase 7).

Databases and search:

- [ ] Remove MongoDB: `vectorSearchMongoDB.ts`, the Mongo half of `VectorSearchController.ts`,
      its integration test, the `mongodb` dependency and env vars; put `/vector-search`
      behind auth.
- [ ] Qdrant optional: `resolveQdrantConnectionConfig()` returns `null` when `QDRANT_URL` is
      unset; rules RAG, disciplinari ops and `vector_embeddings` degrade with one
      "RAG disabled" log and a 503 `feature_not_configured` payload.
- [ ] `prisma.config.ts`: `DIRECT_URL` defaults to `DATABASE_URL`; LangGraph checkpointer
      (`checkpointer-factory.ts`, schema `langgraph`) verified with the compose DB user.

Optional third-party services become soft:

- [ ] Tavily tool omitted when `TAVILY_API_KEY` is unset (`chat_dosage_agent/tools.ts`,
      `job_agent/tools.ts`, `fertilizer_agent`).
- [ ] `OCR_PROVIDER=mistral|datalab|none`; extraction endpoints return
      `feature_not_configured` when `none`.
- [ ] Google login routes 404 cleanly when `GOOGLE_CLIENT_ID` is unset.
- [ ] Unauthenticated `GET /config/public` returning
      `{ setupComplete, features: {...}, registrationOpen, accessMode, publicUrl, llm: { provider, allowModelSelection } }`.

**Done when**: `APP_MODE=all` boots API + workers with only Postgres and Redis; upload and
signed download work on local disk; `grep -rn "storage.googleapis.com\|key_gcp" backend/src`
is empty; unit + integration tests green in `docker-compose.test.yml`.

## Phase 5 - First-run wizard + runtime settings + env validation (L)

Runtime settings:

- [ ] Prisma model `InstanceSetting { key, value, isSecret, updatedAt }`; secrets encrypted
      with `APP_ENCRYPTION_KEY` (AES-256-GCM); `infrastructure/config/settings.service.ts`
      with typed getters, in-memory cache, change events; precedence env override > DB >
      env default, documented per key.
- [ ] `infrastructure/config/env.ts` (zod): required core (`DATABASE_URL`, `REDIS_URL`,
      `DATA_DIR`); secrets `JWT_SECRET` and `APP_ENCRYPTION_KEY` read from
      `DATA_DIR/secrets/` and generated on first boot when absent; optional groups validated
      only when present; readable boot error. Replace `src/types/environment.d.ts`.
- [ ] Remove `JWT_SECRET || 'default_secret'` in `VerifyEmailUseCase.ts:22`.

Setup wizard (frontend route `/setup`, backend `POST /setup/*`, only while
`setupComplete=false`, then locked):

- [ ] Step 1 admin account: creates the first `ADMIN` with verified email; replaces the
      seed users; `INVITE_CODE` gone; `REGISTRATION_OPEN` becomes a setting (default false).
- [ ] Step 2 AI provider: choose Anthropic / OpenAI / OpenRouter / Local. On opening the
      step the backend probes Ollama at `host.docker.internal:11434`, the `ollama` sidecar
      and `localhost:11434`; a running daemon appears as "Ollama detected" with its live
      model list and a default pre-selected. A "Local server URL" field accepts any Ollama
      or OpenAI-compatible base URL (LM Studio, llama.cpp, vLLM, another computer on the
      LAN) with "Test connection" that lists the models it serves. Cloud providers ask for
      a key with the same test button.
- [ ] Step 3 access: "This network only" / "Stable public link (Tailscale)" / "Own domain
      (Cloudflare)" with guided sub-steps (Phase 7 implements the bridge; step shows status).
- [ ] Step 4 email (optional): SMTP fields with "Send test email"; skip keeps `EMAIL_DRIVER=none`.
- [ ] Step 5 done: shows LAN URL + QR, links to Settings > Access and Settings > AI.
- [ ] Admin routes: empty `WHITE_LIST_EMAILS` means "any ADMIN"; `PASSWORD_PROTECTED_ROUTES`
      optional; Settings sections `ai`, `access`, `email`, `backup` editable after setup.
- [ ] Frontend reads `/config/public` at boot; redirects to `/setup` until complete; hides
      Google button, OCR actions, web-search hints when dark.
- [ ] `prisma/seed.ts` reduced to reference data; runs automatically after migrations.

**Done when**: fresh install -> wizard -> chat with the chosen provider, without editing any
file; a missing required variable prints its name and exits 1; secrets survive restarts in
`./data/secrets`.

## Phase 6 - One-command install on a computer or NAS -> SELF-HOSTABLE (L)

Image:

- [ ] `docker/app.Dockerfile`: multi-stage on `node:22-bookworm-slim` (prebuilt `canvas`,
      no compile), builds backend + frontend, final image runs `APP_MODE=all`; targets
      `api`/`worker` reuse the same image; delete `Dockerfile.worker` and the nginx image.
- [ ] `docker/entrypoint.sh`: wait for Postgres, `prisma migrate deploy`, seed reference
      data, generate secrets if missing, start; exits non-zero with a readable message.
- [ ] Image size under 900 MB; idle RSS of `app` under 600 MB; measured and recorded in
      `docs/install/requirements.md`.
- [ ] Decide Bun vs Node 22 for running `dist/` (open decision) and fix ESM emission if Node.

Compose:

- [ ] Root `docker-compose.yml` with `image:` only: `app` (port 3000), `postgres`
      (internal, no published port), `redis`; bind mounts `./data/{postgres,redis,uploads,
      secrets,backups}`; healthchecks; `depends_on: condition: service_healthy`; no
      `platform:` pins; `restart: unless-stopped`.
- [ ] Profiles: `tailscale`, `cloudflare` (Phase 7), `qdrant`, `ollama` (+ `ollama-pull`
      init for `OLLAMA_DEFAULT_MODEL`), `mailpit` (dev), `autoupdate` (Watchtower).
- [ ] `docker-compose.build.yml` (contributors build from source), `docker-compose.dev.yml`
      (bind mounts, `tsx watch`, `vite`), `docker-compose.test.yml` + `scripts/test-env.mjs`
      moved from backend.
- [ ] `.env.example` reduced to advanced overrides; everything a normal user needs is in
      the wizard.

Installers and guides (`installer/`, `docs/install/`):

- [ ] `install.sh` for macOS/Linux: checks Docker, creates `~/seminai`, downloads compose,
      `docker compose up -d`, prints `http://localhost:3000` and the LAN URL.
- [ ] Synology Container Manager guide (project from pasted YAML, screenshots), QNAP
      Container Station guide, Unraid Community Apps template (`installer/unraid/*.xml`),
      Raspberry Pi 5 notes (arm64), Windows with Docker Desktop.
- [ ] Ollama guidance: run it on a computer with a GPU on the same LAN and point the wizard
      at it; NAS-local Ollama only for small models.

Data, backup, update:

- [ ] Settings > Backup: "Backup now" (pg_dump + uploads tarball into `./data/backups/`),
      nightly schedule via BullMQ cron, retention setting, download button; restore via
      `docker compose run --rm app seminai restore <file>`; `docs/backup-restore.md`
      including NAS Hyper Backup / snapshot advice for `./data`.
- [ ] Update path: `docker compose pull && docker compose up -d` runs migrations at boot;
      Settings shows current version and "update available" from GitHub releases;
      `docs/install/update.md`.
- [ ] Verify from a clean clone on macOS arm64, Linux amd64, a Synology DSM 7 and a
      Raspberry Pi 5.

**Done when**: on each verified platform, the documented install steps end with the wizard
in the browser; first upload, chat message and background job succeed; a backup file appears
in `./data/backups`; `docker compose pull && up -d` upgrades without data loss.

## Phase 7 - Remote access bridge + invitations -> TEAM-READY (M)

Public URL resolution:

- [ ] `infrastructure/config/public-url.service.ts`: resolution order DB setting ->
      tunnel discovery -> `PUBLIC_APP_URL` env -> request origin (only for browser-built
      links); all outgoing links (invitations, verification, reset, WhatsApp, email
      templates) use it; `CORS_ORIGINS` and `FRONTEND_URL` derive from it automatically.

Tailscale Funnel (recommended, profile `tailscale`):

- [ ] Sidecar `tailscale/tailscale` with `TS_AUTHKEY` (from the wizard, stored encrypted and
      injected via `./data/secrets/tailscale.env`), `TS_HOSTNAME=seminai`, state volume,
      `TS_SERVE_CONFIG=/config/serve.json` written by the app (Funnel 443 -> `http://app:3000`).
- [ ] App reads the sidecar LocalAPI over the shared socket volume to get `DNSName` and
      Funnel status; surfaces "Enable Funnel in your tailnet" with the exact link when the
      ACL attribute is missing.
- [ ] `docs/remote-access.md`: create account, generate auth key, paste, done; screenshots.

Cloudflare (profile `cloudflare`):

- [ ] Sidecar `cloudflare/cloudflared` with `CLOUDFLARE_TUNNEL_TOKEN` (pattern from the old
      `docker-compose.prod.yml`); user enters the public hostname in the wizard; optional
      note on Cloudflare Access.
- [ ] Demo mode: `cloudflared` binary bundled in the app image; "Create temporary public
      link" button spawns a quick tunnel, parses the `*.trycloudflare.com` URL, shows it
      with a 'changes on restart, not for invitations' warning.

Access page and invitations:

- [ ] Settings > Access: LAN URL (`window.location.origin` when on LAN), public URL, QR
      codes, tunnel health, mode switch, "Test from outside" check that fetches
      `/config/public` through the public URL.
- [ ] Invitations: "Copy link", QR and WhatsApp share buttons on each pending invite
      (link = public URL + `/workspace/accept-invitation?token=...`); accept page for a
      visitor without an account pre-fills the email from the token, registers, accepts and
      lands in the workspace; email sending stays optional.
- [ ] Registration: invite-only by default; `REGISTRATION_OPEN` toggle in Settings with a
      warning when a public URL is active.

Hardening when public:

- [ ] `trust proxy` from `TRUST_PROXY`; `secure` cookies and HSTS when the public URL is
      https; login rate limit per IP + per account with progressive lockout
      (`rateLimiter.ts` pattern); admin-only endpoints re-audited (`/vector-search`,
      `/debug`, developer portal).
- [ ] Document that microphone and camera in the browser need HTTPS: works on the tunnel URL
      and on `localhost`, not on `http://<nas-ip>` (photo upload via file picker still works).

**Done when**: from a phone on mobile data, an invited user opens the shared link, registers,
lands in the workspace and sends a chat message; switching access mode in Settings updates
invitation links without restart; `docker compose --profile tailscale up -d` from the docs
yields a working public URL in under 10 minutes.

## Phase 8 - AI providers + chat model picker -> MIKE LEVEL (L)

Backend provider layer (`backend/src/infrastructure/services/llm-*.ts`):

- [ ] `llm-config.ts`: `LLM_PROVIDER=anthropic|openai|openrouter|ollama|openai-compatible`
      replaces `ChatGateway`; keys and base URLs from settings (`ANTHROPIC_API_KEY` alias
      `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`,
      `LOCAL_LLM_BASE_URL` + optional key); `LLM_DEFAULT_MODEL` per provider; unknown
      provider is a boot error; provider switch at runtime without restart.
- [ ] `GET /llm/providers/detect` (admin): probes Ollama at `host.docker.internal:11434`,
      `ollama:11434`, `localhost:11434` plus any saved local URL, with a 2 s timeout each;
      returns `{ detected: [{ kind: 'ollama'|'openai-compatible', baseUrl, version, models }] }`;
      used by the wizard and Settings > AI; `host.docker.internal` mapped in compose via
      `extra_hosts: host-gateway` so a daemon on the host machine is reachable from the container.
- [ ] `llm-model-factory.ts`: add `ChatOllama` (`@langchain/ollama`) and first-class
      `ChatAnthropic`; `llm-chat-completion-client.ts` uses Ollama's OpenAI-compatible
      `/v1/chat/completions`; `llm-vision-client.ts` provider-aware.
- [ ] `llm-model-validation.ts`: accept bare Ollama tags (`llama3.1:8b`); per-provider
      allowlist sourced from the catalogue.
- [ ] `llm-embeddings-factory.ts`: `EMBEDDINGS_PROVIDER=openai|ollama` (open decision),
      `EMBEDDINGS_DIMENSIONS` from config; remove the three re-hardcoded `1536` values.
- [ ] Remove legacy enums in `agents/dosage_agent/llmProvider.ts` and
      `agents/shared/modelRouter.ts`; fix `agents/audio_to_text/index.ts:149` (STT dark
      unless provider is openai/openrouter) and the vestigial `OPENAI_API_KEY` read in
      `field_note_agent/graph.ts:125`.
- [ ] `GET /llm/models` (auth): `{ provider, default, models: [{ id, label, vision, contextWindow, tools }] }`;
      Ollama reads `GET {OLLAMA_BASE_URL}/api/tags` live (and `/api/show` for capabilities)
      and flags models without tool-calling; `openai-compatible` reads `GET /v1/models`
      live; OpenRouter `/models` cached 1 h; Anthropic/OpenAI from a static
      `llm-model-catalog.ts`. Nothing local is ever hard-coded: a model pulled into Ollama
      appears in the picker on the next refresh.
- [ ] `AgentChatController.ts:72` `enforceChatModel()` replaced by the setting
      `allowClientModelSelection` (default true; hosted deployment sets false) + catalogue
      validation; `Chat.modelName`/`Chat.temperature` persist the choice.
- [ ] Costs: `LlmUsage` gets a `provider` column; `llm_costs/usage.ts` charges 0 for
      `ollama` instead of the $5/$15 per M fallback; `resolve-provider.ts` and
      `model-name-normalize.ts` preserve `:` tags.
- [ ] `evals/` promptfoo configs parametrised by `LLM_PROVIDER`; `LLM_PROVIDER=mock`
      deterministic provider for e2e and CI.

Frontend:

- [ ] `hooks/use-llm-models.ts` (pattern: `hooks/use-mention-search.ts`) on `/llm/models`.
- [ ] `<ModelPicker>` in `components/molecules/chat-input.tsx`; `modelName` plumbed through
      `lib/agent-chat-stream.ts` (`AgentChatStreamPayload`, `buildFormData()`),
      `lib/chat-stream-store.ts`, `hooks/use-dosage-chat-stream.ts`, `hooks/use-chat-stream.tsx`;
      last choice remembered per user.
- [ ] Settings > AI: active provider, key management, default model, "Local servers" panel
      with detected/added URLs, daemon status, live model list, pull-model helper for
      Ollama; cost display hidden for local providers.
- [ ] i18n keys (en, it); `docs/ai-providers.md` with per-provider setup and the
      "features dark per provider" matrix.

**Done when**: the same chat flow completes with each of the four providers, switching model
from the picker mid-session and switching provider from Settings without restart; Ollama
runs show 0 cost; `npm run eval:smoke` passes with `mock`.

## Phase 9 - CI, images, e2e, docs (M)

- [ ] `.github/workflows/ci.yml`: lint, type-check, unit tests (backend, frontend,
      packages/mcp), OpenAPI drift check, gitleaks, private-data grep gate.
- [ ] `.github/workflows/release.yml`: on tag, build and push `ghcr.io/seminai/seminai`
      for linux/amd64 + linux/arm64 (buildx), attach `docker-compose.yml` and `install.sh`
      to the GitHub release, update the Unraid template.
- [ ] `.github/workflows/e2e.yml`: `docker compose up` with `LLM_PROVIDER=mock`, Playwright
      suite in `e2e/` (wizard, login, invite link acceptance, create company and field,
      chat message, file upload, backup). Nightly variant with `--profile ollama`.
- [ ] `loadtest/` k6 scripts targeting `localhost` with a seeded user; document usage.
- [ ] `docs/`: `install/*`, `remote-access.md`, `backup-restore.md`, `ai-providers.md`,
      `architecture.md`, `env-reference.md`, `contributing.md`, `docs/backend/` API docs,
      `docs/mcp.md`, `docs/telegram-bot.md`, `troubleshooting.md`.
- [ ] Issue and PR templates, `CHANGELOG.md`, Renovate or Dependabot, `CODEOWNERS`.

**Done when**: CI green on `main`; a tagged release produces pullable multi-arch images;
e2e passes from a clean runner; every variable in `.env.example` appears in
`docs/env-reference.md`.

## Phase 10 - Go public (S)

- [ ] Re-run the Phase 3 grep gate, gitleaks and trufflehog on the full history of the repo.
- [ ] Confirm Phase 0 actions still in force (key revoked, bucket private).
- [ ] `git log --format=%ae | sort -u` lists only intended identities; DCO sign-off on.
- [ ] Branch protection on `main`, required CI, Issues and Discussions enabled, topics set.
- [ ] Tag `v0.1.0`, flip visibility to public, archive `seminai-be-v2` and `seminai-fe-v3`.
- [ ] Announce with the README install steps; watch first issues for NAS-specific problems.

**Done when**: repository public, `v0.1.0` tagged, a third party installs on a NAS from the
public docs and reaches the wizard.

## Phase 11 - Post-public backlog (can follow)

- [ ] Optional TOTP two-factor login and passkeys for public deployments.
- [ ] Per-user default model and temperature stored in `Settings`.
- [ ] Ollama embeddings + Qdrant collection migration tooling if not done in Phase 8.
- [ ] `scripts/fetch-open-data.ts` for Ministry/AGEA/SISCO refresh with checksum pinning.
- [ ] Public fixtures subset with synthetic farms so more integration tests run in the open.
- [ ] Local HTTPS on LAN via bundled Caddy with a local CA, for microphone use without a tunnel.
- [ ] Helm chart / Kubernetes manifests; Cloud Run reference deployment in the ops repo.
- [ ] Reconsider the marketing hub (`apps/hub`) once the app repo is stable.
