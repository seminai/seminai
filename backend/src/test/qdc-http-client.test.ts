import { QdcApiError } from '../infrastructure/services/integrations/qdc_imageline/errors';
import { QdcHttpClient } from '../infrastructure/services/integrations/qdc_imageline/http-client';

function buildFetchMock(body: unknown, ok = true, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: 'Bad Request',
    json: () => Promise.resolve(body),
  });
}

function buildClient(fetchMock: jest.Mock): QdcHttpClient {
  const client = new QdcHttpClient({ fetchImpl: fetchMock as unknown as typeof fetch });
  client.setAccessToken('test-token');
  return client;
}

describe('QdcHttpClient', () => {
  it('throws when the access token is not set', async () => {
    const client = new QdcHttpClient({
      fetchImpl: buildFetchMock({ message: 'ok' }) as unknown as typeof fetch,
    });
    await expect(client.request('/getlicenzainfo')).rejects.toThrow('Access token not set');
  });

  it('builds the GET query string omitting undefined and serializing number arrays as csv', async () => {
    const fetchMock = buildFetchMock({ message: 'ok' });
    const client = buildClient(fetchMock);
    await client.request('/gettrattamenti', 'GET', {
      id_azienda: 7,
      lista_id_unita: [1, 2, 3],
      data_periododa: undefined,
      daconfermare: false,
    });
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).toContain('/gettrattamenti?');
    expect(actualUrl).toContain('id_azienda=7');
    expect(actualUrl).toContain('lista_id_unita=1%2C2%2C3');
    expect(actualUrl).toContain('daconfermare=false');
    expect(actualUrl).not.toContain('data_periododa');
  });

  it('appends the access_token query parameter to every request', async () => {
    const fetchMock = buildFetchMock({ message: 'ok' });
    const client = buildClient(fetchMock);
    await client.request('/getlicenzainfo');
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).toContain('access_token=test-token');
  });

  it('form-encodes POST params with the urlencoded content type', async () => {
    const fetchMock = buildFetchMock({ message: 'ok' });
    const client = buildClient(fetchMock);
    await client.request('/setcaricoagrofarmaco', 'POST', {
      id_azienda: 7,
      qta: 2.5,
      note: undefined,
    });
    const actualOptions = (fetchMock.mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect((actualOptions.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(actualOptions.body).toBe('id_azienda=7&qta=2.5');
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).not.toContain('id_azienda');
    expect(actualUrl).toContain('access_token=test-token');
  });

  it('throws QdcApiError with code and description on non-ok responses', async () => {
    const fetchMock = buildFetchMock(
      { error: 'invalid_scope', error_description: 'Scope non valido' },
      false,
      400,
    );
    const client = buildClient(fetchMock);
    const expectedError = { name: 'QdcApiError', httpStatus: 400, code: 'invalid_scope' };
    await expect(client.request('/getlicenzainfo')).rejects.toMatchObject(expectedError);
    await expect(client.request('/getlicenzainfo')).rejects.toBeInstanceOf(QdcApiError);
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('not json')),
    });
    const client = buildClient(fetchMock);
    await expect(client.request('/getlicenzainfo')).rejects.toThrow('Internal Server Error');
  });
});
