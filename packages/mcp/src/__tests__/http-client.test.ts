import { SeminaiHttpClient } from '../client/http';
import {
  SeminaiAuthError,
  SeminaiHttpError,
  SeminaiNotFoundError,
  SeminaiTimeoutError,
} from '../client/http-errors';

type FetchMock = jest.Mock<Promise<Response>, Parameters<typeof fetch>>;

function makeResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeClient(fetchMock: FetchMock, timeoutMs = 30_000): SeminaiHttpClient {
  return new SeminaiHttpClient({
    baseUrl: 'http://localhost:8081',
    token: 'jwt-token',
    timeoutMs,
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

describe('SeminaiHttpClient', () => {
  it('attaches Bearer auth, Accept and resolves JSON', async () => {
    const fetchMock: FetchMock = jest.fn().mockResolvedValue(makeResponse([{ id: 'c1' }]));
    const client = makeClient(fetchMock);
    const actual = await client.get<Array<{ id: string }>>('/companies');
    expect(actual).toEqual([{ id: 'c1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:8081/companies');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(headers.Accept).toBe('application/json');
    expect(init?.method).toBe('GET');
  });

  it('serialises query string and trims trailing slashes from baseUrl', async () => {
    const fetchMock: FetchMock = jest.fn().mockResolvedValue(makeResponse({}));
    const client = new SeminaiHttpClient({
      baseUrl: 'http://localhost:8081/',
      token: 'jwt-token',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.get('/bdf/products/search', {
      query: { q: 'glifo', page: 1, active: true, ignored: undefined },
    });
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('http://localhost:8081');
    expect(parsed.pathname).toBe('/bdf/products/search');
    expect(parsed.searchParams.get('q')).toBe('glifo');
    expect(parsed.searchParams.get('page')).toBe('1');
    expect(parsed.searchParams.get('active')).toBe('true');
    expect(parsed.searchParams.get('ignored')).toBeNull();
  });

  it('serialises number arrays as comma-separated query values', async () => {
    const fetchMock: FetchMock = jest.fn().mockResolvedValue(makeResponse({}));
    const client = makeClient(fetchMock);
    await client.get('/qdc/colture/unita', { query: { idAzienda: 7, listaIdUnita: [1, 2, 3] } });
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('listaIdUnita')).toBe('1,2,3');
  });

  it('serialises JSON body and sets Content-Type on POST', async () => {
    const fetchMock: FetchMock = jest.fn().mockResolvedValue(makeResponse({ id: 'new' }));
    const client = makeClient(fetchMock);
    await client.post('/companies', { body: { name: 'Acme' } });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(init?.body).toBe('{"name":"Acme"}');
  });

  it('maps 401 to SeminaiAuthError', async () => {
    const fetchMock: FetchMock = jest
      .fn()
      .mockResolvedValue(makeResponse({ error: 'expired' }, { status: 401 }));
    const client = makeClient(fetchMock);
    await expect(client.get('/companies')).rejects.toBeInstanceOf(SeminaiAuthError);
  });

  it('maps 404 to SeminaiNotFoundError', async () => {
    const fetchMock: FetchMock = jest
      .fn()
      .mockResolvedValue(makeResponse({ error: 'not found' }, { status: 404 }));
    const client = makeClient(fetchMock);
    await expect(client.get('/companies/x')).rejects.toBeInstanceOf(SeminaiNotFoundError);
  });

  it('maps generic non-2xx to SeminaiHttpError with status and body', async () => {
    const fetchMock: FetchMock = jest
      .fn()
      .mockResolvedValue(makeResponse({ error: 'boom' }, { status: 500 }));
    const client = makeClient(fetchMock);
    const err = await client.get('/companies').catch((e) => e);
    expect(err).toBeInstanceOf(SeminaiHttpError);
    expect((err as SeminaiHttpError).status).toBe(500);
    expect((err as SeminaiHttpError).body).toEqual({ error: 'boom' });
  });

  it('aborts and throws SeminaiTimeoutError when fetch times out', async () => {
    const fetchMock: FetchMock = jest.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const client = makeClient(fetchMock, 50);
    await expect(client.get('/jobs')).rejects.toBeInstanceOf(SeminaiTimeoutError);
  });
});
