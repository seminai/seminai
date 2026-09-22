import type { SeminaiHttpClient, RequestOptions } from '../client/http';
import { SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors';
import { getLabelHandler } from '../tools/labels';

interface RecordedCall {
  path: string;
  options: RequestOptions | undefined;
}

function makeHttpStub(perPath: Record<string, () => Promise<unknown>>): {
  client: SeminaiHttpClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const getMock = jest.fn().mockImplementation((path: string, options?: RequestOptions) => {
    calls.push({ path, options });
    const handler = perPath[path];
    if (!handler) {
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    }
    return handler();
  });
  const client = {
    get: getMock,
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as SeminaiHttpClient;
  return { client, calls };
}

const ARGS = {
  productName: 'sacron 45 wg',
  registrationNumber: '12916',
};

describe('getLabelHandler — cascade behaviour', () => {
  it('returns source=seminai_cache on cache hit and does not call SIAN extract', async () => {
    const cachedPayload = { id: 'L1', productName: 'sacron 45 wg' };
    const { client, calls } = makeHttpStub({
      '/labels/by-product': () => Promise.resolve({ status: 'success', data: cachedPayload }),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/labels/by-product');
    expect(calls[0].options?.query).toEqual({
      name: 'sacron 45 wg',
      regNumber: '12916',
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.source).toBe('seminai_cache');
    expect(body.label).toEqual({ status: 'success', data: cachedPayload });
    expect('isError' in result ? result.isError : false).toBe(false);
  });

  it('on cache miss with allowLiveSianExtraction=false returns explicit gate error', async () => {
    const { client, calls } = makeHttpStub({
      '/labels/by-product': () =>
        Promise.reject(new SeminaiNotFoundError({ code: 'LABEL_NOT_FOUND' })),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: false,
    });
    expect(calls).toHaveLength(1);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found in Seminai cache');
    expect(result.content[0].text).toContain('allowLiveSianExtraction=true');
  });

  it('on cache miss with allowLiveSianExtraction=true falls back to /labels/extract and reports source=sian_live_extraction', async () => {
    const extractedPayload = {
      status: 'success',
      data: { url: 'https://sian/x.pdf', label: { active: 'glifosato' }, text: '...' },
    };
    const { client, calls } = makeHttpStub({
      '/labels/by-product': () =>
        Promise.reject(new SeminaiNotFoundError({ code: 'LABEL_NOT_FOUND' })),
      '/labels/extract': () => Promise.resolve(extractedPayload),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: true,
    });
    expect(calls.map((c) => c.path)).toEqual(['/labels/by-product', '/labels/extract']);
    expect(calls[1].options?.query).toEqual({
      name: 'sacron 45 wg',
      regNumber: '12916',
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.source).toBe('sian_live_extraction');
    expect(body.label).toEqual(extractedPayload);
  });

  it('on cache miss + SIAN 404 returns specific not-found message', async () => {
    const { client } = makeHttpStub({
      '/labels/by-product': () =>
        Promise.reject(new SeminaiNotFoundError({ code: 'LABEL_NOT_FOUND' })),
      '/labels/extract': () =>
        Promise.reject(new SeminaiNotFoundError({ code: 'LABEL_NOT_FOUND' })),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: true,
    });
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('SIAN returned 404');
  });

  it('on cache lookup 5xx the cascade aborts and reports the cache stage error', async () => {
    const { client, calls } = makeHttpStub({
      '/labels/by-product': () =>
        Promise.reject(new SeminaiHttpError(503, 'Service Unavailable', null)),
      '/labels/extract': () => Promise.resolve({ ok: true }),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: true,
    });
    expect(calls).toHaveLength(1);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('cache lookup');
    expect(result.content[0].text).toContain('503');
  });

  it('on SIAN extraction 5xx reports the SIAN stage error', async () => {
    const { client } = makeHttpStub({
      '/labels/by-product': () =>
        Promise.reject(new SeminaiNotFoundError({ code: 'LABEL_NOT_FOUND' })),
      '/labels/extract': () =>
        Promise.reject(new SeminaiHttpError(500, 'Internal server error', null)),
    });
    const result = await getLabelHandler(client, {
      ...ARGS,
      allowLiveSianExtraction: true,
    });
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('SIAN live extraction');
    expect(result.content[0].text).toContain('500');
  });
});
