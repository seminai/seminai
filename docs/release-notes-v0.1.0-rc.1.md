# Seminai v0.1.0-rc.1

Private release-candidate notes. This tag is **not** pushed and no GitHub
release is created.

## Included

- One Node 22 image (`seminai:local`) serving API, worker, and SPA
- Compose stack: `app` + `postgres` + `redis`
- First-boot setup wizard, invite-only signup, LAN-only default
- Ollama local-first chat (`qwen3.5:4b`) and `nomic-embed-text` embeddings

## Not included / blocked

- Third-party NAS install (Synology, QNAP, Unraid) — hardware gate
- Real Tailscale/Cloudflare account — access gate
- Hosted GitHub Actions — workflows exist, unverified
- Legacy GCP key/bucket revocation — owner-side

## Verify locally

```bash
npm run rc:scan
sh scripts/release/build-rc-bundle.sh
sh scripts/deploy/install.sh
docker compose -f compose.yaml up -d
```

Do not change repository visibility. Do not publish packages.
