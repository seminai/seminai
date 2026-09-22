import {
  clearAllTokenCache,
  clearTokenCache,
  getTokenFromClientId,
} from '../infrastructure/services/integrations/qdc_imageline/auth';
import { QDC_ALL_SCOPES } from '../infrastructure/services/integrations/qdc_imageline/types';

const LEGACY_SCOPE_STRING = 'r_magazzini,w_magazzini';

function authResponse(): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: () => Promise.resolve({ code: 'auth-code-1', state: '' }) };
}

function tokenResponse(token = 'tok-1'): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ access_token: token, expires_in: 3600 }),
  };
}

/** Mocks the two-step flow: GET /auth (json code) → POST /token (access token). */
function buildFlowFetchMock(): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    return Promise.resolve(url.includes('/auth?') ? authResponse() : tokenResponse());
  });
}

function requestedAuthScope(fetchMock: jest.Mock, callIndex = 0): string | null {
  const url = (fetchMock.mock.calls[callIndex]?.[0] ?? '') as string;
  return new URL(url).searchParams.get('scope');
}

describe('getTokenFromClientId', () => {
  beforeEach(() => {
    clearAllTokenCache();
  });

  it('requests every QDC scope by default, comma-separated', async () => {
    const fetchMock = buildFlowFetchMock();
    const actualToken = await getTokenFromClientId('client-a', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(actualToken).toBe('tok-1');
    expect(requestedAuthScope(fetchMock)).toBe(QDC_ALL_SCOPES.join(','));
    expect(QDC_ALL_SCOPES).toHaveLength(7);
  });

  it('exchanges the authorization code on POST /token with code and client_id', async () => {
    const fetchMock = buildFlowFetchMock();
    await getTokenFromClientId('client-a', { fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const actualTokenUrl = (fetchMock.mock.calls[1]?.[0] ?? '') as string;
    const actualBody = new URLSearchParams(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string,
    );
    expect(actualTokenUrl).toContain('/token');
    expect(actualBody.get('code')).toBe('auth-code-1');
    expect(actualBody.get('client_id')).toBe('client-a');
  });

  it('honors explicitly requested scopes', async () => {
    const fetchMock = buildFlowFetchMock();
    await getTokenFromClientId('client-a', {
      scopes: ['r_operazioni', 'r_colture'],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(requestedAuthScope(fetchMock)).toBe('r_operazioni,r_colture');
  });

  it('caches tokens per clientId and scope set', async () => {
    const fetchMock = buildFlowFetchMock();
    const fetchImpl = fetchMock as unknown as typeof fetch;
    await getTokenFromClientId('client-a', { fetchImpl });
    await getTokenFromClientId('client-a', { fetchImpl });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getTokenFromClientId('client-a', { scopes: ['r_operazioni'], fetchImpl });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries once with the legacy warehouse scopes on invalid_scope', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'invalid_scope' }),
      })
      .mockResolvedValueOnce(authResponse())
      .mockResolvedValueOnce(tokenResponse('tok-legacy'));
    const actualToken = await getTokenFromClientId('client-a', {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(actualToken).toBe('tok-legacy');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestedAuthScope(fetchMock, 1)).toBe(LEGACY_SCOPE_STRING);
    warnSpy.mockRestore();
  });

  it('throws on non-scope errors without retrying', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: 'unauthorized_client',
          error_description: 'Client ID is not valid',
        }),
    });
    await expect(
      getTokenFromClientId('client-a', { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow('Client ID is not valid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clearTokenCache removes every scope variant of a client and nothing else', async () => {
    const fetchMock = buildFlowFetchMock();
    const fetchImpl = fetchMock as unknown as typeof fetch;
    await getTokenFromClientId('client-a', { fetchImpl });
    await getTokenFromClientId('client-a', { scopes: ['r_operazioni'], fetchImpl });
    await getTokenFromClientId('client-b', { fetchImpl });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    clearTokenCache('client-a');
    await getTokenFromClientId('client-a', { fetchImpl });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await getTokenFromClientId('client-b', { fetchImpl });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
