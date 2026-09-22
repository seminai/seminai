# Install Seminai locally

Requirements: Docker, Docker Compose v2, and optional Ollama on the host.

```bash
sh scripts/deploy/install.sh
docker compose -f compose.yaml build app
docker compose -f compose.yaml up -d
```

The default stack is `app` + `postgres` + `redis`. State lives under `./data`.
Open `http://127.0.0.1:8081/setup` and complete the first-boot wizard. Ollama is
the local-first provider; leave `LLM_GATEWAY` unset or set it to `ollama`.

Optional Compose profiles: `ollama`, `qdrant`, `mailpit`, `tailscale`, `cloudflare`.

Offline rebuild:

```bash
sh scripts/deploy/offline-build.sh
```

Update an existing install with `sh scripts/deploy/update.sh`.
