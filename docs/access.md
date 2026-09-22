# Access and invitations

Default access mode is `lan`. The instance binds `0.0.0.0:8081` and resolves a
loopback public URL until `ACCESS_MODE=public` and a tunnel URL are set.

Signup is invite-only. The first boot writes `DATA_DIR/secrets/invite`. Admins
can copy the invite URL and QR from Settings → Access, and rotate the code
without SMTP.

Tunnel profiles (not required for LAN):

- Tailscale Funnel: Compose profile `tailscale` and `TAILSCALE_FUNNEL_URL`
- Cloudflare Tunnel: Compose profile `cloudflare` and `CLOUDFLARE_TUNNEL_URL`

When `ACCESS_MODE=public`, the API trusts one proxy hop, sends HSTS, and marks
session cookies Secure. Confirm the tunnel health from `GET /access/status`
(admin) or `GET /config/public` (no secrets).
