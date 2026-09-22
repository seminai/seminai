# Seminai local-first release roadmap

This file is the implementation plan and release evidence ledger for the private
`seminai/seminai` monorepo. Phases are executed in order. A phase may advance only after
its complete gate is green.

## Non-negotiable boundaries

- Keep the repository private. Do not publish packages, create GitHub releases, change
  repository visibility, or archive the source repositories.
- Never copy user or customer datasets into this repository, Git history, container layers,
  test artifacts, logs, or reports. Real-data fixtures may only be read from a local path
  outside every repository through `SEMINAI_FIXTURES_DIR`.
- The default runtime is local: Node.js 22, PostgreSQL, Redis, local filesystem storage, and
  Ollama. Qdrant and every external integration are optional.
- GCP and GCS are removed from the product. Legacy cloud credential revocation and bucket
  cleanup are external administrative work and are not performed from this repository.
- Generated Prisma, Orval, and TanStack files are not versioned; setup and build regenerate
  them.
- Source and documentation are English, non-generated files stay at or below 300 lines, and
  TypeScript contains no `any`.

## Release status

| Phase | State | Gate evidence |
| --- | --- | --- |
| Preliminary | DONE | 2026-09-22: 30/30 suites, 220/220 tests, no open handles |
| 0. Safety bootstrap | DONE | Commit `446298c`; privacy scan and syntax checks green |
| 1. Monorepo import | DONE | 2026-09-22, code commit `82d1ed8`; complete root gate green |
| 2. Synthetic fixtures | DONE | 2026-09-22, code commit `f176b66`; complete gate green |
| 3. Scrub and compliance | DONE | 2026-09-22, tested code commit `7e8e78d`; complete gate green |
| 4. Self-contained backend | DONE | 2026-09-22, tested code commit `1768abb`; complete gate green |
| 5. Runtime setup wizard | NOT STARTED | Blocked by Phase 4 |
| 6. One-command install | NOT STARTED | Requires real hardware verification |
| 7. Remote access and invites | NOT STARTED | Requires a real tunnel account and mobile test |
| 8. AI providers and models | NOT STARTED | Blocked by Phase 7 |
| 9. CI, images, e2e, docs | NOT STARTED | Hosted CI deliberately remains unverified |
| 10. Private release candidate | NOT STARTED | Requires third-party NAS installation |
| 11. Post-RC backlog | DEFERRED | Deliberately outside this release |

## Preliminary gate — reproducible baseline

- [x] Use isolated snapshots of current `origin/main`; do not modify source checkouts.
- [x] Make current-year field availability tests date-independent.
- [x] Run Jest with open-handle detection and close or identify every leaked handle.
- [x] Centralize the live-test model and remove cloud-model literals from live tests.
- [x] Gate: 220/220 fast integration tests pass with no open handles.

Evidence (2026-09-22):

```text
npm run test:int:fast:env -- --silent --detectOpenHandles
Test Suites: 30 passed, 30 total
Tests:       220 passed, 220 total
```

The source checkout was not changed. The two current-year fixes and the deterministic
no-credential BDF behavior are carried into Phase 1 from the isolated snapshot.

## Phase 0 — safety bootstrap

- [x] Start from the private target at current `origin/main` on an isolated feature branch.
- [x] Add a deterministic tracked-file import manifest with explicit exclusions.
- [x] Add scanners for private datasets, credentials, environment files, dumps, and legacy
  cloud storage references.
- [x] Ignore all runtime data, secrets, generated output, reports, and SQL dumps.
- [x] Verify `seminai/seminai` remains private and `main` remains its default branch.
- [x] Gate: baseline green, scanner green, no secrets or user data staged.

External legacy cleanup: **NOT PERFORMED**. GCP key revocation, old bucket policy cleanup,
and credential rotation belong to the old environment. Publication remains prohibited until
an owner separately confirms that any historical credentials are invalid.

## Phase 1 — monorepo import

- [x] Import only Git blobs from verified `origin/main` snapshots into `backend/`,
  `frontend/`, `packages/mcp`, `packages/telegram-bot`, `evals/`, and `loadtest/`.
- [x] Exclude marketing, user/customer data, commercial BDF data, dumps, private documents,
  generated files, artifacts, and local permission settings.
- [x] Configure npm workspaces, one lockfile, root scripts, OpenAPI/Orval, Prisma generation,
  and dataset synchronization.
- [x] Include the processed phytosanitary snapshot with source, licence, date, and checksum.
- [x] Gate: clean install, build, lint, type-check, unit tests, public integration tests,
  privacy scans, and repository size below 60 MB.

Evidence (2026-09-22, tested code commit `82d1ed8`):

```text
npm ci                                      added 2,595 packages from the root lockfile
npm run codegen / build / type-check / lint green; lint errors: 0
npm test                                    BE 1,417 + FE 86 + MCP 82 passed
npm run test:int:fast:env -- --silent --detectOpenHandles
                                             29 suites, 210 tests, no open handles
npm run test:int:public:env -- --silent --detectOpenHandles
                                             47 suites, 286 tests, no open handles
npm run privacy:scan                        passed
tracked repository size                    37.74 MiB; one package-lock.json
```

The import used archived Git blobs from the two verified `origin/main` refs. Customer-derived
OCR fixtures and evaluation flows were excluded before the first import commit; known customer
identifiers in retained examples were replaced with synthetic values. Generated Prisma, Orval,
TanStack, build, and coverage output remain untracked.

## Phase 2 — synthetic and local-only fixtures

- [x] Replace customer-coupled tests with synthetic fixtures or open data.
- [x] Add a fixture harness reading optional real data only from `SEMINAI_FIXTURES_DIR`.
- [x] Keep real fixture contents, identifiers, and filenames out of output and artifacts.
- [x] Gate: full suite green without external fixtures; optional local suite runnable when the
  directory exists; customer-name and private-data scans clean.

Evidence (2026-09-22, tested code commit `f176b66`):

```text
npm ci                                      added 2,595 packages from the root lockfile
npm run codegen / build / type-check / lint green; lint errors: 0
npm test                                    BE 1,417 + FE 86 + MCP 82 passed
npm run test:int:fast:env -- --silent --detectOpenHandles
                                             29 suites, 210 tests, no open handles
npm run test:int:public:env -- --silent --detectOpenHandles
                                             48 suites, 290 tests, no open handles
SEMINAI_FIXTURES_DIR=<external synthetic temp> npm run test:int:private:env -- --silent --detectOpenHandles
                                             1 suite, 1 test, no open handles
npm run privacy:scan                        passed; known customer identifiers absent
```

The tracked fixture tree contains only fabricated FatturaPA and Lombardia-shaped samples.
The optional harness requires an absolute real path outside the repository, rejects escaping
symlinks, and reports only aggregate counts and bytes. Its configured gate used a temporary
fabricated external file that was removed immediately afterward; no user dataset was accessed.

## Phase 3 — scrub, licensing, and structural compliance

- [x] Remove internal hostnames, personal addresses, cloud URLs, internal references, and
  dead dependencies.
- [x] Add AGPL-3.0, commercial terms, DCO, NOTICE, SECURITY, and local-first README files.
- [x] Split every non-generated file over 300 lines, with characterization tests before
  complex splits, and remove all TypeScript `any` usage.
- [x] Gate: structural checks, gitleaks, trufflehog, and full integration suite green.
- [x] Create local tag `v0.1.0-alpha.1`; do not push it.

Evidence (2026-09-22, tested code commit `7e8e78d`):

```text
npm run codegen / build / type-check / lint green; structural scan: 3,553 files
npm test                                    BE 1,424 passed + 6 skipped; FE 86; MCP 82
npm run test:int:fast:env -- --silent --detectOpenHandles
                                             69 suites, 210 tests, no open handles
npm run test:int:public:env -- --silent --detectOpenHandles
                                             95 suites, 290 tests, no open handles
npm run test:ollama:smoke                   qwen3.5:4b tool call green; remote cost zero
npm run privacy:scan:full                   passed
gitleaks filesystem and Git history         no leaks
trufflehog filesystem and Git history       0 verified, 0 unverified
```

The direct GCS dependency, credential mount, public bucket URLs, and legacy cloud storage
implementation were removed. File persistence is now tenant-scoped and local; the formal
storage port, optional S3 adapter, and signed-read contract remain Phase 4 work. Commit
metadata and retained examples use neutral project identities. The tag is local only.

## Phase 4 — self-contained backend

- [x] Add `IFileStorage` with `upload`, `delete`, `getReadUrl`, `exists`, and `list`.
- [x] Implement tenant-scoped local storage and optional S3; remove GCS, its credentials,
  dependency, and public storage URLs.
- [x] Add expiring signed downloads and cross-tenant coverage.
- [x] Implement `APP_MODE=all|api|worker`, with inline worker as the default.
- [x] Remove MongoDB. Return `feature_not_configured` for optional Qdrant, OCR, Tavily,
  Google login, and email features.
- [x] Expose `GET /config/public`.
- [x] Gate: API, worker, queue, and signed upload/download work with only PostgreSQL and Redis.

Evidence (2026-09-22, tested code commit `1768abb`):

```text
npm ci                                      added 2,621 packages from the root lockfile
npm run codegen / build / type-check / lint green; structural scan: 3,571 files
npm test                                    BE 1,437 passed + 6 skipped; FE 86; MCP 82
npm run test:integration:fast -- --silent --detectOpenHandles
                                             70 suites, 213 tests, no open handles
npm run test:integration:public -- --silent --detectOpenHandles
                                             96 suites, 293 tests, no open handles
npm run test:llm:smoke                      qwen3.5:4b tool call green; remote cost zero
npm run privacy:scan:full                   passed
```

File persistence uses `IFileStorage` with a tenant-scoped local adapter and optional S3.
Signed local downloads are HMAC-expiring; unconfigured Qdrant, OCR, Tavily, Google login,
and email return HTTP 503 `feature_not_configured`. `APP_MODE=all` remains the default
inline-worker process. Prisma migrations are now versioned; dumps stay ignored.

## Phase 5 — runtime settings and setup wizard

- [ ] Add encrypted `InstanceSetting` storage with AES-256-GCM, invalidatable cache, and
  precedence `environment override > database > default`.
- [ ] Validate the environment with Zod and generate persistent JWT/encryption secrets under
  `DATA_DIR/secrets` on first boot.
- [ ] Implement `/setup` for admin, Ollama or another AI provider, access, optional email, and
  review. Lock setup mutations after completion.
- [ ] Detect Ollama and make it the local-first default; hide unconfigured features.
- [ ] Gate: blank install to Ollama chat without file edits, persistent restart, and setup e2e.

## Phase 6 — one-command installation

- [ ] Build one Node.js 22 Debian-slim image for API, worker, and SPA; do not use Bun.
- [ ] Default Compose contains `app`, `postgres`, and `redis`, with all state under `./data`.
- [ ] Add optional Ollama, Qdrant, Mailpit, Tailscale, and Cloudflare profiles.
- [ ] Add installer, backup, restore, update, and offline source-build workflows.
- [ ] Gate: real verification on macOS arm64, Linux amd64, Synology, QNAP, Unraid, and
  Raspberry Pi 5. Emulation does not satisfy this gate.

## Phase 7 — remote access and invitations

- [ ] Keep LAN-only as the default; add resolved public URL plus optional Tailscale Funnel
  and Cloudflare profiles.
- [ ] Add Access settings, QR code, tunnel health, SMTP-free invites, and invite-only signup.
- [ ] Enable secure cookies, HSTS, trusted proxy, rate limiting, and lockout under public HTTPS.
- [ ] Gate: real mobile-network invite, registration, and chat using an actual tunnel account.

## Phase 8 — AI providers and model picker

- [ ] Support `anthropic`, `openai`, `openrouter`, `ollama`, and `openai-compatible`; reject
  unknown providers explicitly.
- [ ] Add `GET /llm/providers/detect`, `GET /llm/models`, a typed catalog, and persisted choice.
- [ ] Default embeddings to Ollama `nomic-embed-text` at 768 dimensions. Namespace Qdrant
  collections by provider, model, and dimension.
- [ ] Use deterministic HTTP mocks for cloud providers and real Ollama only for live LLM tests.
- [ ] Gate: tool chat with `qwen3.5:4b`, `qwen3.5:9b`, and `llama3.1:8b`; embeddings with
  `nomic-embed-text`; Qwen vision; Ollama cost reported as zero.

## Phase 9 — CI, e2e, images, and documentation

- [ ] Add CI/release/e2e workflows, Playwright, k6, privacy scans, OpenAPI drift checks, SBOM,
  and buildx definitions for amd64 and arm64.
- [ ] CI uses a deterministic provider mock; the local release gate uses Ollama.
- [ ] Complete install, access, backup, provider, architecture, environment, and troubleshooting
  documentation.
- [ ] Gate: clean-clone e2e, local multi-platform images, aligned documentation, and no
  structural debt. Hosted workflow runs remain explicitly unverified while GitHub is unchanged.

## Phase 10 — private release candidate

- [ ] Scan the filesystem, Git history, and OCI layers for secrets and private data.
- [ ] Generate installer/Compose bundle, checksums, SBOM, and release notes for
  `v0.1.0-rc.1`.
- [ ] Have a third party install the private bundle on real NAS hardware.
- [ ] Do not change visibility, create a GitHub release, push tags, or archive old repositories.
- [ ] Gate: mark **READY, NOT PUBLISHED** only after every local and physical acceptance check.

## Phase 11 — backlog

Deliberately deferred until after the private release candidate. Nothing in this section can
be used to claim the release gates above are complete.

## Gate protocol

Every phase runs a clean install, code generation/drift check, build, type-check, lint, unit
tests, fast integration, public full integration, and phase-specific tests. Once the Ollama
harness exists, run `qwen3.5:4b` on every phase and the full local matrix in Phases 5, 8, 9,
and 10. Diagnose failures in the same phase and rerun the complete gate without retry-based
flakiness masking.

For each green phase: commit implementation, record date/commit/commands/results here, then
commit this ledger update separately. Final states are `DONE`, `NOT APPLICABLE`, `BLOCKED BY
HARDWARE/ACCOUNT`, or `DEFERRED`.
