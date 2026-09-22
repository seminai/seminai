import type { SeminaiHttpClient, RequestOptions } from '../client/http';
import { SeminaiHttpError } from '../client/http-errors';
import {
  listMyJobsHandler,
  listMyProductsHandler,
  listMyVerifiedJobsHandler,
  searchMentionsHandler,
} from '../tools/stock-jobs';

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

describe('Stock & Job tool handlers', () => {
  it('listMyProductsHandler hits /products/me without filter when companyName omitted', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({ status: 'success', data: { products: [] } }),
    );
    await listMyProductsHandler(client, { compact: false });
    expect(calls[0].path).toBe('/products/me');
    expect(calls[0].options?.query).toEqual({ companyName: undefined });
  });

  it('listMyProductsHandler forwards companyName when provided', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({ status: 'success', data: { products: [] } }),
    );
    await listMyProductsHandler(client, { companyName: 'azienda-demo', compact: false });
    expect(calls[0].options?.query).toEqual({ companyName: 'azienda-demo' });
  });

  it('listMyProductsHandler compact=true projects essential fields and computes stockTotal', async () => {
    const backendPayload = {
      status: 'success',
      data: {
        products: [
          {
            id: 'p1',
            name: 'CHEMOL 90 EL',
            sku: 'CHEMOL90EL-001155',
            category: 'PESTICIDE',
            type: 'Fitosanitario',
            description: 'lots of text',
            administrativeStatus: 'Autorizzato',
            registrationNumber: '001155',
            labelUrl: 'https://cdn.seminai.demo/labels/chemol.pdf',
            labelMetadata: {
              formulation: { code: 'EC', description: 'CONCENTRATO EMULSIONABILE' },
              legalEntity: 'CHEMIA S.P.A.',
              activeSubstances: ['PARAFFIN OIL/(CAS 8042-47-5)'],
            },
            stocks: [
              { quantity: 30, uom: 'L' },
              { quantity: 25.92, uom: 'L' },
            ],
            warehouse: {
              name: 'Deposito Nord',
              company: { id: 'co-1', name: 'Seminai Fruit Farm' },
            },
          },
        ],
      },
    };
    const { client } = makeHttpStub(() => Promise.resolve(backendPayload));
    const result = await listMyProductsHandler(client, { compact: true });
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({
      status: 'success',
      data: {
        products: [
          {
            id: 'p1',
            name: 'CHEMOL 90 EL',
            category: 'PESTICIDE',
            registrationNumber: '001155',
            administrativeStatus: 'Autorizzato',
            activeSubstances: ['PARAFFIN OIL/(CAS 8042-47-5)'],
            stockTotal: 55.92,
            warehouseName: 'Deposito Nord',
            companyId: 'co-1',
            companyName: 'Seminai Fruit Farm',
          },
        ],
        count: 1,
      },
    });
    expect(JSON.stringify(body).length).toBeLessThan(JSON.stringify(backendPayload).length);
  });

  it('listMyProductsHandler compact=true returns 0 stockTotal when stocks is missing or non-array', async () => {
    const { client } = makeHttpStub(() =>
      Promise.resolve({
        status: 'success',
        data: { products: [{ id: 'p2', name: 'NoStock', stocks: null }] },
      }),
    );
    const result = await listMyProductsHandler(client, { compact: true });
    const body = JSON.parse(result.content[0].text);
    expect(body.data.products[0].stockTotal).toBe(0);
  });

  it('listMyJobsHandler hits /jobs/me', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({ status: 'success', data: { jobs: [] } }),
    );
    await listMyJobsHandler(client, {});
    expect(calls[0].path).toBe('/jobs/me');
  });

  it('listMyVerifiedJobsHandler forwards page/limit/companyName', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({ status: 'success', data: { jobs: [] } }),
    );
    await listMyVerifiedJobsHandler(client, { companyName: 'azienda-demo', page: 2, limit: 50 });
    expect(calls[0].path).toBe('/jobs/me/verified');
    expect(calls[0].options?.query).toEqual({ companyName: 'azienda-demo', page: 2, limit: 50 });
  });

  it('searchMentionsHandler requires q and forwards optional types', async () => {
    const { client, calls } = makeHttpStub(() =>
      Promise.resolve({
        status: 'success',
        data: [{ id: 'c1', type: 'company', label: 'azienda-demo' }],
      }),
    );
    await searchMentionsHandler(client, { q: 'azienda-demo', types: 'company,product' });
    expect(calls[0].path).toBe('/mentions/search');
    expect(calls[0].options?.query).toEqual({ q: 'azienda-demo', types: 'company,product' });
  });

  it('returns isError content with stage label on HTTP error', async () => {
    const { client } = makeHttpStub(() =>
      Promise.reject(new SeminaiHttpError(503, 'Service Unavailable', null)),
    );
    const result = await listMyJobsHandler(client, {});
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('list_my_jobs');
    expect(result.content[0].text).toContain('503');
  });
});
