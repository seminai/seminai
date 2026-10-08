# Environment

For Docker web use the root `.env.example`; `backend/.env.example` is for backend development. After first boot, JWT and encryption secrets live
in `DATA_DIR/secrets` and override empty env values.

Important keys:

| Key | Default | Notes |
| --- | --- | --- |
| `APP_MODE` | `all` | `api` skips queue workers; `worker` skips HTTP |
| `LLM_GATEWAY` | unset in Docker | Configure optional AI through the app; environment overrides persisted settings |
| `SEMINAI_BIND_HOST` | `127.0.0.1` | Docker host interface; `0.0.0.0` enables LAN exposure |
| `SEMINAI_PORT` | `8081` | Browser port |
| `SEMINAI_DATA_DIR` | `./data` | Docker persistent host directory |
| `ACCESS_MODE` | `lan` | `public` enables HSTS and Secure cookies |
| `STORAGE_DRIVER` | `local` | `s3` needs bucket credentials |
| `DATA_DIR` | `./data` | Secrets, files, invite code |
| `REDIS_URL` | required in Compose | Preferred over Upstash in production |

Do not commit `.env`. Integration tests start isolated Postgres/Redis
containers and ignore customer datasets.
