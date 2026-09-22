# Backup and restore

All durable state is under `./data` (`app`, `postgres`, `redis`, optional
`ollama`/`qdrant`/`tailscale`).

```bash
sh scripts/deploy/backup.sh
sh scripts/deploy/restore.sh data/backups/seminai-<stamp>.tar.gz
```

The backup script dumps PostgreSQL and archives `data/app`, `data/postgres`,
and `data/redis`. Restore stops the stack, extracts the archive, reloads the
latest SQL dump, and starts Compose again.

Keep backups off the application host. Do not commit `data/` or SQL dumps.
