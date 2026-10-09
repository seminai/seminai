# Access and invitations

Default access mode is `lan`. Docker binds inside the container but publishes only
`127.0.0.1:8081` on the host. Set `SEMINAI_BIND_HOST=0.0.0.0` and the actual
`PUBLIC_BASE_URL` to enable LAN access. Desktop has its separate LAN toggle.
Use `ACCESS_MODE=public` only behind a configured HTTPS reverse proxy/tunnel.

Signup is invite-only. The first boot writes `DATA_DIR/secrets/invite`. Admins
can copy the invite URL and QR from Settings → Access, and rotate the code
without SMTP.

Tunnel profiles (not required for LAN):

- Tailscale Funnel: Compose profile `tailscale` and `TAILSCALE_FUNNEL_URL`
- Cloudflare Tunnel: Compose profile `cloudflare` and `CLOUDFLARE_TUNNEL_URL`

When `ACCESS_MODE=public`, the API trusts one proxy hop, sends HSTS, and marks
session cookies Secure. Confirm the tunnel health from `GET /access/status`
(admin) or `GET /config/public` (no secrets).
