import { shouldBypassSpa } from '../spaStatic';

describe('shouldBypassSpa', () => {
  it('serves client routes through the SPA', () => {
    expect(shouldBypassSpa('/setup', 'GET')).toBe(false);
    expect(shouldBypassSpa('/login', 'GET')).toBe(false);
    expect(shouldBypassSpa('/', 'GET')).toBe(false);
  });

  it('leaves API and infrastructure paths to Express', () => {
    expect(shouldBypassSpa('/api/auth/me', 'GET')).toBe(true);
    expect(shouldBypassSpa('/health', 'GET')).toBe(true);
    expect(shouldBypassSpa('/wake-up', 'GET')).toBe(true);
    expect(shouldBypassSpa('/api-docs', 'GET')).toBe(true);
    expect(shouldBypassSpa('/developer/docs', 'GET')).toBe(true);
    expect(shouldBypassSpa('/socket.io/', 'GET')).toBe(true);
  });

  it('does not intercept non-GET methods', () => {
    expect(shouldBypassSpa('/setup', 'POST')).toBe(true);
    expect(shouldBypassSpa('/login', 'PUT')).toBe(true);
  });
});
