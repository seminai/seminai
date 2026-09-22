import {
  isOriginAllowed,
  buildAllowedOrigins,
} from '../infrastructure/http/middlewares/corsPolicy';

describe('corsPolicy', () => {
  const originalEnv = process.env;
  function buildEnvWithoutCorsOverrides(): NodeJS.ProcessEnv {
    const nextEnv = { ...originalEnv };
    Reflect.deleteProperty(nextEnv, 'CORS_ORIGINS');
    Reflect.deleteProperty(nextEnv, 'FRONTEND_URL');
    Reflect.deleteProperty(nextEnv, 'API_PUBLIC_ORIGIN');
    return nextEnv;
  }

  beforeEach(() => {
    process.env = buildEnvWithoutCorsOverrides();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows configured frontend origins', () => {
    process.env.FRONTEND_URL = 'https://app.seminai.tech';
    expect(buildAllowedOrigins()).toContain('https://app.seminai.tech');
    expect(isOriginAllowed('https://app.seminai.tech', 'api.example.com')).toBe(true);
  });

  it('allows same-host origin for co-hosted developer portal', () => {
    const host = 'seminai-be-v2-661301438659.europe-west1.run.app';
    const origin = `https://${host}`;
    expect(isOriginAllowed(origin, host)).toBe(true);
  });

  it('rejects unknown cross-origin hosts', () => {
    expect(
      isOriginAllowed(
        'https://evil.example.com',
        'seminai-be-v2-661301438659.europe-west1.run.app',
      ),
    ).toBe(false);
  });
});
