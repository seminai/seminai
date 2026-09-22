import type { SeminaiHttpClient, RequestOptions } from '../client/http';
import { SeminaiHttpError } from '../client/http-errors';
import {
  bdfAuthorizedCropsHandler,
  bdfGetDosesHandler,
  bdfListCropsHandler,
  bdfListPestsHandler,
  bdfSearchProductsHandler,
} from '../tools/bdf';

interface RecordedCall {
  path: string;
  options: RequestOptions | undefined;
}

function makeHttpStub(impl: () => Promise<unknown>): {
  client: SeminaiHttpClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const getMock = jest.fn().mockImplementation((path: string, options?: RequestOptions) => {
    calls.push({ path, options });
    return impl();
  });
  const client = {
    get: getMock,
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as SeminaiHttpClient;
  return { client, calls };
}

describe('BDF tool handlers — happy path & query forwarding', () => {
  it('bdfListCropsHandler hits GET /bdf/colture', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve([{ codice: 'C1' }]));
    const result = await bdfListCropsHandler(client);
    expect(calls[0].path).toBe('/bdf/colture');
    expect(JSON.parse(result.content[0].text)).toEqual([{ codice: 'C1' }]);
  });

  it('bdfListPestsHandler forwards coltura as query param', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve([]));
    await bdfListPestsHandler(client, { coltura: 'GR' });
    expect(calls[0].path).toBe('/bdf/avversita');
    expect(calls[0].options?.query).toEqual({ coltura: 'GR' });
  });

  it('bdfSearchProductsHandler forwards every provided filter and skips undefined ones', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve([]));
    await bdfSearchProductsHandler(client, {
      ricalfa: 'glifosate',
      coltura: 'GR',
      tipologia: undefined,
      codSA: 'SA01',
      dettbio: undefined,
      avversita: undefined,
    });
    expect(calls[0].path).toBe('/bdf/prodotti');
    expect(calls[0].options?.query).toEqual({
      ricalfa: 'glifosate',
      coltura: 'GR',
      avversita: undefined,
      dettbio: undefined,
      tipologia: undefined,
      codSA: 'SA01',
    });
  });

  it('bdfGetDosesHandler forwards required and optional query params', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve({ doses: [] }));
    await bdfGetDosesHandler(client, {
      codprod: 'P123',
      coltura: 'GR',
      avversita: 'AV9',
      datatrattamento: '2026-05-10',
    });
    expect(calls[0].path).toBe('/bdf/dosi');
    expect(calls[0].options?.query).toEqual({
      codprod: 'P123',
      coltura: 'GR',
      avversita: 'AV9',
      datatrattamento: '2026-05-10',
    });
  });

  it('bdfAuthorizedCropsHandler forwards codice as query param', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve([]));
    await bdfAuthorizedCropsHandler(client, { codice: 'P123' });
    expect(calls[0].path).toBe('/bdf/impieghi');
    expect(calls[0].options?.query).toEqual({ codice: 'P123' });
  });
});

describe('BDF tool handlers — error mapping', () => {
  it('returns isError when BDF endpoint returns 5xx (e.g. BDF auth failure)', async () => {
    const { client } = makeHttpStub(() =>
      Promise.reject(
        new SeminaiHttpError(500, 'Internal server error', { code: 'INTERNAL_ERROR' }),
      ),
    );
    const result = await bdfListCropsHandler(client);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('500');
  });

  it('returns isError when 400 from BDF (missing required param)', async () => {
    const { client } = makeHttpStub(() =>
      Promise.reject(new SeminaiHttpError(400, 'Parametro coltura obbligatorio', null)),
    );
    const result = await bdfListPestsHandler(client, { coltura: '' });
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
  });
});
