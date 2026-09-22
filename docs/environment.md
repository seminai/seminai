# Environment

Copy `backend/.env.example`. After first boot, JWT and encryption secrets live
in `DATA_DIR/secrets` and override empty env values.

Important keys:

| Key | Default | Notes |
| --- | --- | --- |
| `APP_MODE` | `all` | `api` skips queue workers; `worker` skips HTTP |
| `LLM_GATEWAY` | `ollama` after setup | Reject unknown providers |
| `ACCESS_MODE` | `lan` | `public` enables HSTS and Secure cookies |
| `STORAGE_DRIVER` | `local` | `s3` needs bucket credentials |
| `DATA_DIR` | `./data` | Secrets, files, invite code |
| `REDIS_URL` | required in Compose | Preferred over Upstash in production |

Do not commit `.env`. Integration tests start isolated Postgres/Redis
containers and ignore customer datasets.
