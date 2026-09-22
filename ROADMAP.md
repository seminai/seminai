# Seminai local-first release roadmap

Implementation plan and ledger for the private `seminai/seminai` monorepo.
Command transcripts live in [`docs/phase-gate-evidence.md`](docs/phase-gate-evidence.md).

## Non-negotiable boundaries

- Keep the repository private. Do not publish packages, create GitHub releases, change
  visibility, or archive the source repositories.
- Never copy user or customer datasets into this repository, Git history, container layers,
  test artifacts, logs, or reports. Real fixtures only via `SEMINAI_FIXTURES_DIR`.
- Default runtime: Node.js 22, PostgreSQL, Redis, local filesystem, Ollama. Qdrant and
  every external integration are optional.
- GCP/GCS are removed. Legacy credential revocation is owner-side, not from this repo.
- Generated Prisma, Orval, and TanStack files are untracked.
- English sources, files at or below 300 lines, no TypeScript `any`.

## Release status

| Phase | State | Gate evidence |
| --- | --- | --- |
| Preliminary | DONE | 2026-09-22: 30/30 suites, 220/220 tests |
| 0. Safety bootstrap | DONE | Commit `446298c` |
| 1. Monorepo import | DONE | Commit `82d1ed8` |
| 2. Synthetic fixtures | DONE | Commit `f176b66` |
| 3. Scrub and compliance | DONE | Commit `7e8e78d`; tag `v0.1.0-alpha.1` local |
| 4. Self-contained backend | DONE | Commit `1768abb` |
| 5. Runtime setup wizard | DONE | Commit `0f00db0` |
| 6. One-command install | BLOCKED BY HARDWARE | Commit `7f8953a`; local Compose green |
| 7. Remote access and invites | BLOCKED BY ACCOUNT | Commit `633df16`; local LAN/invite green |
| 8. AI providers and models | NOT STARTED | Local provider catalog next |
| 9. CI, images, e2e, docs | NOT STARTED | Hosted CI unverified |
| 10. Private release candidate | NOT STARTED | Requires third-party NAS install |
| 11. Post-RC backlog | DEFERRED | Outside this release |

## Preliminary

- [x] Isolated snapshots; date-independent field tests; open-handle Jest; live-model centralization.
- [x] Gate: 220/220 fast integration tests, no open handles.

## Phase 0 — safety bootstrap

- [x] Private `origin/main` branch, import manifest, private-data scanners, ignore runtime data.
- [x] Gate green. External GCP cleanup: **NOT PERFORMED**.

## Phase 1 — monorepo import

- [x] Import verified blobs into `backend/`, `frontend/`, `packages/*`, `evals/`, `loadtest/`.
- [x] Workspaces, OpenAPI/Orval, Prisma, dataset sync; phytosanitary snapshot with licence.
- [x] Gate: install/build/lint/tests/privacy; tracked size under 60 MB.

## Phase 2 — synthetic fixtures

- [x] Synthetic fixtures and optional `SEMINAI_FIXTURES_DIR` harness.
- [x] Gate: suite green without external fixtures; privacy scan clean.

## Phase 3 — scrub and compliance

- [x] Remove cloud URLs and dead deps; add AGPL/DCO/NOTICE/SECURITY; split files; no `any`.
- [x] Local tag `v0.1.0-alpha.1` (not pushed).

## Phase 4 — self-contained backend

- [x] `IFileStorage` local+S3, signed downloads, `APP_MODE`, no Mongo, `feature_not_configured`,
  `GET /config/public`.

## Phase 5 — runtime settings and setup wizard

- [x] Encrypted `InstanceSetting`, first-boot secrets, `/setup`, Ollama default.

## Phase 6 — one-command installation

- [x] Node 22 Debian-slim image (API+worker+SPA, no Bun); Compose `app`+`postgres`+`redis`.
- [x] Optional Ollama/Qdrant/Mailpit/Tailscale/Cloudflare profiles; deploy scripts.
- [ ] Hardware gate on macOS arm64, Linux amd64, Synology, QNAP, Unraid, Raspberry Pi 5.

## Phase 7 — remote access and invitations

- [x] LAN-only default; resolved public URL; optional Tailscale Funnel and Cloudflare.
- [x] Access settings, QR, tunnel health, SMTP-free invites, invite-only signup.
- [x] Secure cookies, HSTS, trusted proxy, rate limiting, lockout under public HTTPS.
- [ ] Gate: real mobile-network invite, registration, and chat on a tunnel account.

## Phase 8 — AI providers and model picker

- [ ] `anthropic|openai|openrouter|ollama|openai-compatible`; reject unknown.
- [ ] `GET /llm/providers/detect`, `GET /llm/models`, Ollama embeddings 768, Qdrant namespaces.
- [ ] Gate: tool chat `qwen3.5:4b`/`9b`/`llama3.1:8b`; vision; zero Ollama cost.

## Phase 9 — CI, e2e, images, and documentation

- [ ] CI/e2e/release, Playwright, k6, privacy, OpenAPI drift, SBOM, buildx amd64/arm64.
- [ ] Hosted GitHub Actions remain explicitly unverified.

## Phase 10 — private release candidate

- [ ] Scan filesystem/history/OCI; installer bundle, checksums, SBOM, notes `v0.1.0-rc.1`.
- [ ] No GitHub release, no tag push, no visibility change.
- [ ] Gate: **READY, NOT PUBLISHED** only after a third-party NAS install.

## Phase 11 — backlog

Deferred until after the private RC.

## Gate protocol

Each phase: clean install, codegen, build, type-check, lint, unit, fast+public integration,
privacy, and phase-specific tests. Failures are fixed in the same phase and the whole gate
is rerun. Then: implementation commit, ledger commit, push `feat/local-first-monorepo`.
Final states: `DONE`, `NOT APPLICABLE`, `BLOCKED BY HARDWARE/ACCOUNT`, `DEFERRED`.
