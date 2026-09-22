import type { SeminaiHttpClient } from '../client/http';
import { SeminaiAuthError, SeminaiHttpError } from '../client/http-errors';
import { listCompaniesHandler } from '../tools/companies';

function makeHttpStub(impl: () => Promise<unknown>): SeminaiHttpClient {
  return {
    get: jest.fn().mockImplementation(impl),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as SeminaiHttpClient;
}

describe('listCompaniesHandler', () => {
  it('returns JSON-formatted text content on success', async () => {
    const companies = [
      { id: 'c1', name: 'Acme' },
      { id: 'c2', name: 'Beta' },
    ];
    const http = makeHttpStub(() => Promise.resolve(companies));
    const result = await listCompaniesHandler(http);
    expect(http.get).toHaveBeenCalledWith('/companies');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(companies);
    expect('isError' in result ? result.isError : false).toBe(false);
  });

  it('returns isError content with status on SeminaiAuthError', async () => {
    const http = makeHttpStub(() => Promise.reject(new SeminaiAuthError({})));
    const result = await listCompaniesHandler(http);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
  });

  it('returns isError content with status on generic SeminaiHttpError', async () => {
    const http = makeHttpStub(() =>
      Promise.reject(new SeminaiHttpError(503, 'Service Unavailable', null)),
    );
    const result = await listCompaniesHandler(http);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('503');
    expect(result.content[0].text).toContain('Service Unavailable');
  });

  it('wraps unexpected errors as Unexpected error content', async () => {
    const http = makeHttpStub(() => Promise.reject(new Error('boom')));
    const result = await listCompaniesHandler(http);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error: boom');
  });
});
