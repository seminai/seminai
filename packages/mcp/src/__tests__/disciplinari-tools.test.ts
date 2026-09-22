import type { SeminaiHttpClient, RequestOptions } from '../client/http';
import { SeminaiHttpError } from '../client/http-errors';
import {
  disciplinariCheckValidityHandler,
  disciplinariExpiringSoonHandler,
  disciplinariListHandler,
  disciplinariSearchHandler,
} from '../tools/disciplinari';

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

describe('Disciplinari tool handlers', () => {
  it('disciplinariListHandler hits /disciplinari/summary', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve({ status: 'success', data: [] }));
    await disciplinariListHandler(client);
    expect(calls[0].path).toBe('/disciplinari/summary');
  });

  it('disciplinariSearchHandler forwards region and year', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve({ status: 'success', data: [] }));
    await disciplinariSearchHandler(client, { region: 'Lombardia', year: 2025 });
    expect(calls[0].path).toBe('/disciplinari/search');
    expect(calls[0].options?.query).toEqual({ region: 'Lombardia', year: 2025 });
  });

  it('disciplinariCheckValidityHandler forwards region and year', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({
        status: 'success',
        data: { exists: false, isValid: false, isExpired: false, needsUpdate: true },
      }),
    );
    await disciplinariCheckValidityHandler(client, { region: 'Lombardia', year: 2025 });
    expect(calls[0].path).toBe('/disciplinari/check-validity');
    expect(calls[0].options?.query).toEqual({ region: 'Lombardia', year: 2025 });
  });

  it('disciplinariExpiringSoonHandler forwards days', async () => {
    const { client, calls } = makeHttpStub(() => Promise.resolve({ status: 'success', data: [] }));
    await disciplinariExpiringSoonHandler(client, { days: 60 });
    expect(calls[0].path).toBe('/disciplinari/expiring-soon');
    expect(calls[0].options?.query).toEqual({ days: 60 });
  });

  it('returns isError content with stage label on HTTP error', async () => {
    const { client } = makeHttpStub(() =>
      Promise.reject(new SeminaiHttpError(500, 'Internal server error', null)),
    );
    const result = await disciplinariSearchHandler(client, { region: 'Toscana', year: 2024 });
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('disciplinari_search');
    expect(result.content[0].text).toContain('500');
  });
});
