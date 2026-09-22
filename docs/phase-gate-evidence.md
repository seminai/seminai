# Phase gate evidence

Detailed command transcripts for [`ROADMAP.md`](../ROADMAP.md). Keep the roadmap itself under 300 lines.

## Preliminary — 2026-09-22

`npm run test:int:fast:env -- --silent --detectOpenHandles` — 30 suites, 220 tests.

## Phase 0 — `446298c`

Privacy scan and syntax checks green. GCP revocation not performed.

## Phase 1 — `82d1ed8`

npm ci 2,595 packages. BE 1,417 + FE 86 + MCP 82. Fast 29/210. Public 47/286. Size 37.74 MiB.

## Phase 2 — `f176b66`

Same unit totals. Fast 29/210. Public 48/290. Optional private harness 1/1 against a temporary fabricated external file.

## Phase 3 — `7e8e78d`

Structural 3,553 files. BE 1,424 + 6 skipped; FE 86; MCP 82. Fast 69/210. Public 95/290. Ollama smoke green. gitleaks/trufflehog clean. Tag `v0.1.0-alpha.1` local only.

## Phase 4 — `1768abb`

Structural 3,571. BE 1,437 + 6 skipped. Fast 70/213. Public 96/293. LLM smoke green.

## Phase 5 — `0f00db0`

Structural 3,601. BE 1,448 + 6 skipped; FE 88. Fast 71/214. Public 97/294. LLM smoke green.

## Phase 6 — `7f8953a` (BLOCKED BY HARDWARE)

Structural 3,608. BE 1,452 + 6 skipped; FE 88. Fast 71/214. Public 97/294. LLM smoke green.
`docker compose -f compose.yaml build app` → `seminai:local`. `up -d` app+postgres+redis healthy.
`GET /health` and `GET /config/public` 200; SPA `/setup` 200; BullMQ workers started.
Hardware matrix (Synology, QNAP, Unraid, Raspberry Pi 5, Linux amd64) not executed.

## Phase 7 — `633df16` (BLOCKED BY ACCOUNT)

Structural 3,619. BE 1,460 + 6 skipped; FE 88; MCP 82. Fast 71/214. Public 97/294. LLM smoke green. Privacy scan clean.
LAN default, invite-only signup, `/access/status` + QR rotate, HSTS/trust-proxy when public.
Mobile-network invite and a real Tailscale/Cloudflare account were not executed.
