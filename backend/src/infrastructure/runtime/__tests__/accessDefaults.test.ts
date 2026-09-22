import type { Request } from 'express';
import { buildInviteUrl, resolveAccessMode, resolvePublicBaseUrl } from '../resolvePublicBaseUrl';
import { resolveTunnelHealth } from '../tunnelHealth';
import { shouldEnableHsts, shouldTrustProxy } from '../../http/applyAccessHardening';
import { getIsSecureRequest } from '../../http/utils/admin-access';

describe('local-first access defaults', () => {
  it('defaults to LAN and a loopback URL', () => {
    const env = { PORT: '8081' };
    expect(resolveAccessMode(env)).toBe('lan');
    expect(resolvePublicBaseUrl(env)).toBe('http://127.0.0.1:8081');
    expect(shouldEnableHsts(env)).toBe(false);
    expect(shouldTrustProxy(env)).toBe(false);
    expect(resolveTunnelHealth(env)).toEqual({
      provider: 'none',
      configured: false,
      healthy: true,
      publicUrl: null,
    });
  });

  it('resolves a public HTTPS URL and enables hardening', () => {
    const env = {
      ACCESS_MODE: 'public',
      PUBLIC_BASE_URL: 'https://seminai.example.ts.net/',
      TAILSCALE_FUNNEL_URL: 'https://seminai.example.ts.net',
    };
    expect(resolveAccessMode(env)).toBe('public');
    expect(resolvePublicBaseUrl(env)).toBe('https://seminai.example.ts.net');
    expect(shouldEnableHsts(env)).toBe(true);
    expect(shouldTrustProxy(env)).toBe(true);
    expect(resolveTunnelHealth(env).provider).toBe('tailscale');
    expect(resolveTunnelHealth(env).healthy).toBe(true);
    expect(buildInviteUrl('abc', env)).toBe(
      'https://seminai.example.ts.net/register?invite=abc',
    );
  });

  it('marks session cookies secure when ACCESS_MODE is public', () => {
    const previous = process.env.ACCESS_MODE;
    process.env.ACCESS_MODE = 'public';
    try {
      const request = { secure: false, headers: {} } as Request;
      expect(getIsSecureRequest(request)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.ACCESS_MODE;
      else process.env.ACCESS_MODE = previous;
    }
  });
});
