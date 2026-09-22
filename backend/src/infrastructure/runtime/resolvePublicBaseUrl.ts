export type AccessMode = 'lan' | 'public';

export function resolveAccessMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AccessMode {
  return env.ACCESS_MODE === 'public' ? 'public' : 'lan';
}

export function resolvePublicBaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const mode = resolveAccessMode(env);
  const candidates =
    mode === 'public'
      ? [
          env.PUBLIC_BASE_URL,
          env.TAILSCALE_FUNNEL_URL,
          env.CLOUDFLARE_TUNNEL_URL,
          env.FRONTEND_URL,
          env.BACKEND_URL,
        ]
      : [env.FRONTEND_URL, env.BACKEND_URL, env.PUBLIC_BASE_URL];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed.replace(/\/$/, '');
  }
  const port = env.PORT || '8081';
  return `http://127.0.0.1:${port}`;
}

export function buildInviteUrl(
  inviteCode: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return `${resolvePublicBaseUrl(env)}/register?invite=${encodeURIComponent(inviteCode)}`;
}
