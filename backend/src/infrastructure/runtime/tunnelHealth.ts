export type TunnelProvider = 'none' | 'tailscale' | 'cloudflare';

export interface TunnelHealth {
  readonly provider: TunnelProvider;
  readonly configured: boolean;
  readonly healthy: boolean;
  readonly publicUrl: string | null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Reports configured tunnel intent. Live account probes are out of this gate. */
export function resolveTunnelHealth(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TunnelHealth {
  const tailscale = env.TAILSCALE_FUNNEL_URL?.trim();
  if (tailscale) {
    return {
      provider: 'tailscale',
      configured: true,
      healthy: isHttpsUrl(tailscale),
      publicUrl: tailscale.replace(/\/$/, ''),
    };
  }
  const cloudflare = env.CLOUDFLARE_TUNNEL_URL?.trim();
  if (cloudflare) {
    return {
      provider: 'cloudflare',
      configured: true,
      healthy: isHttpsUrl(cloudflare),
      publicUrl: cloudflare.replace(/\/$/, ''),
    };
  }
  const mode = env.ACCESS_MODE === 'public' ? 'public' : 'lan';
  return {
    provider: 'none',
    configured: false,
    healthy: mode === 'lan',
    publicUrl: null,
  };
}
