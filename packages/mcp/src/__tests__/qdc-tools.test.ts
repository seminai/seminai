import type { SeminaiHttpClient } from '../client/http';
import { SeminaiHttpError } from '../client/http-errors';
import { qdcGet, qdcMutate } from '../tools/qdc/shared';

function makeHttp(impl: Partial<SeminaiHttpClient>): SeminaiHttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    ...impl,
  } as unknown as SeminaiHttpClient;
}

describe('qdcGet', () => {
  it('unwraps the Seminai envelope and returns JSON content', async () => {
    const http = makeHttp({
      get: jest.fn().mockResolvedValue({
        status: 'success',
        data: { message: 'ok', records: [{ ID: 1 }] },
      }),
    });
    const result = await qdcGet(http, '/qdc/licenza/info', {}, true, 'info');
    expect(http.get).toHaveBeenCalledWith('/qdc/licenza/info', { query: {} });
    expect(JSON.parse(result.content[0].text)).toEqual({ message: 'ok', records: [{ ID: 1 }] });
  });

  it('maps HTTP errors to isError content', async () => {
    const http = makeHttp({
      get: jest.fn().mockRejectedValue(new SeminaiHttpError(502, 'bad gateway', null)),
    });
    const result = await qdcGet(http, '/qdc/licenza/info', {}, true, 'info');
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('502');
  });
});

describe('qdcMutate', () => {
  it('refuses writes when confirm is false', async () => {
    const http = makeHttp({ post: jest.fn() });
    const result = await qdcMutate(http, 'post', '/qdc/x', { body: {} }, false, 'write');
    expect(http.post).not.toHaveBeenCalled();
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('confirm=true');
  });

  it('posts when confirm is true', async () => {
    const http = makeHttp({
      post: jest.fn().mockResolvedValue({ status: 'success', data: { message: 'ok' } }),
    });
    const result = await qdcMutate(http, 'post', '/qdc/x', { body: { a: 1 } }, true, 'write');
    expect(http.post).toHaveBeenCalledWith('/qdc/x', { body: { a: 1 } });
    expect(JSON.parse(result.content[0].text)).toEqual({ message: 'ok' });
  });
});
