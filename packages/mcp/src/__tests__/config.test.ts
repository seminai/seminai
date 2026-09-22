import { loadConfig } from '../config';

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const actual = loadConfig({
      SEMINAI_API_BASE_URL: 'http://localhost:8081',
      SEMINAI_API_TOKEN: 'jwt-token',
    });
    expect(actual.apiBaseUrl).toBe('http://localhost:8081');
    expect(actual.apiToken).toBe('jwt-token');
    expect(actual.serverName).toBe('seminai');
    expect(actual.serverVersion).toBe('0.0.1');
  });

  it('honours overrides for serverName and serverVersion', () => {
    const actual = loadConfig({
      SEMINAI_API_BASE_URL: 'http://localhost:8081',
      SEMINAI_API_TOKEN: 'jwt-token',
      SEMINAI_MCP_SERVER_NAME: 'seminai-dev',
      SEMINAI_MCP_SERVER_VERSION: '9.9.9',
    });
    expect(actual.serverName).toBe('seminai-dev');
    expect(actual.serverVersion).toBe('9.9.9');
  });

  it('throws when SEMINAI_API_BASE_URL is missing', () => {
    expect(() =>
      loadConfig({
        SEMINAI_API_TOKEN: 'jwt-token',
      }),
    ).toThrow(/Invalid Seminai MCP config/);
  });

  it('throws when SEMINAI_API_BASE_URL is not a URL', () => {
    expect(() =>
      loadConfig({
        SEMINAI_API_BASE_URL: 'not-a-url',
        SEMINAI_API_TOKEN: 'jwt-token',
      }),
    ).toThrow(/apiBaseUrl/);
  });

  it('throws when SEMINAI_API_TOKEN is missing', () => {
    expect(() =>
      loadConfig({
        SEMINAI_API_BASE_URL: 'http://localhost:8081',
      }),
    ).toThrow(/apiToken/);
  });
});
