import type { SeminaiHttpClient } from '../client/http';
import { SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors';
import { listFieldsHandler } from '../tools/fields';
import { listMachinesHandler } from '../tools/machines';
import { listProductionUnitsHandler } from '../tools/production-units';
import { listWarehousesHandler } from '../tools/warehouses';
import { listWorkspacesHandler } from '../tools/workspaces';

function makeHttpStub(impl: (path: string) => Promise<unknown>): {
  client: SeminaiHttpClient;
  getMock: jest.Mock;
} {
  const getMock = jest.fn().mockImplementation(impl);
  const client = {
    get: getMock,
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  } as unknown as SeminaiHttpClient;
  return { client, getMock };
}

describe('Catalog tool handlers — happy path', () => {
  it('listWorkspacesHandler hits GET /workspaces', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([{ id: 'w1' }]));
    const result = await listWorkspacesHandler(client);
    expect(getMock).toHaveBeenCalledWith('/workspaces');
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 'w1' }]);
  });

  it('listFieldsHandler hits GET /fields', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([{ id: 'f1' }]));
    const result = await listFieldsHandler(client);
    expect(getMock).toHaveBeenCalledWith('/fields');
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 'f1' }]);
  });

  it('listProductionUnitsHandler hits GET /production-units and passes through when compact=false', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([{ id: 'pu1' }]));
    const result = await listProductionUnitsHandler(client, { compact: false });
    expect(getMock).toHaveBeenCalledWith('/production-units');
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 'pu1' }]);
  });

  it('listProductionUnitsHandler compact=true projects only essential fields and adds count', async () => {
    const backendPayload = {
      status: 'success',
      data: {
        productionUnits: [
          {
            productionUnit: {
              id: 'pu-1',
              name: 'Uva Lambrusco 2025',
              cropName: 'Vitis vinifera',
              cropType: 'Vigneto',
              variety: 'Lambrusco Ancellotta',
              areaHa: 4.9,
              startDate: '2025-03-10T00:00:00.000Z',
              endDate: '2025-10-10T00:00:00.000Z',
              protocoll: 'BIO-2025',
              acquaTotalePeridoL: 120000,
            },
            companyId: 'co-1',
            companyName: 'Seminai Fruit Farm',
            crop: { name: 'Vitis vinifera', type: 'Vigneto', variety: 'Lambrusco' },
            fields: [{ id: 'f1', name: 'Vigna', sauHa: 4.9 }],
          },
        ],
      },
    };
    const { client } = makeHttpStub(() => Promise.resolve(backendPayload));
    const result = await listProductionUnitsHandler(client, { compact: true });
    const body = JSON.parse(result.content[0].text);
    expect(body).toEqual({
      status: 'success',
      data: {
        productionUnits: [
          {
            id: 'pu-1',
            name: 'Uva Lambrusco 2025',
            cropName: 'Vitis vinifera',
            variety: 'Lambrusco Ancellotta',
            areaHa: 4.9,
            startDate: '2025-03-10T00:00:00.000Z',
            endDate: '2025-10-10T00:00:00.000Z',
            companyId: 'co-1',
            companyName: 'Seminai Fruit Farm',
          },
        ],
        count: 1,
      },
    });
    expect(JSON.stringify(body).length).toBeLessThan(JSON.stringify(backendPayload).length);
  });

  it('listProductionUnitsHandler compact=true is defensive against unexpected shapes', async () => {
    const weirdPayload = { something: 'else' };
    const { client } = makeHttpStub(() => Promise.resolve(weirdPayload));
    const result = await listProductionUnitsHandler(client, { compact: true });
    expect(JSON.parse(result.content[0].text)).toEqual(weirdPayload);
  });

  it('listMachinesHandler builds path with companyId', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([{ id: 'm1' }]));
    const result = await listMachinesHandler(client, { companyId: 'comp-123' });
    expect(getMock).toHaveBeenCalledWith('/machines/company/comp-123');
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 'm1' }]);
  });

  it('listMachinesHandler URL-encodes the companyId', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([]));
    await listMachinesHandler(client, { companyId: 'a b/c' });
    expect(getMock).toHaveBeenCalledWith('/machines/company/a%20b%2Fc');
  });

  it('listWarehousesHandler builds path with companyId', async () => {
    const { client, getMock } = makeHttpStub(() => Promise.resolve([{ id: 'w-1' }]));
    const result = await listWarehousesHandler(client, { companyId: 'comp-123' });
    expect(getMock).toHaveBeenCalledWith('/warehouses/company/comp-123');
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 'w-1' }]);
  });
});

describe('Catalog tool handlers — error mapping', () => {
  it('returns isError content with status when API returns 404', async () => {
    const { client } = makeHttpStub(() => Promise.reject(new SeminaiNotFoundError({})));
    const result = await listMachinesHandler(client, { companyId: 'missing' });
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
  });

  it('returns isError content with body for generic 5xx', async () => {
    const { client } = makeHttpStub(() =>
      Promise.reject(new SeminaiHttpError(500, 'Internal Server Error', null)),
    );
    const result = await listFieldsHandler(client);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('500');
  });

  it('wraps non-HTTP errors as Unexpected error', async () => {
    const { client } = makeHttpStub(() => Promise.reject(new Error('socket hangup')));
    const result = await listWorkspacesHandler(client);
    expect('isError' in result && result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected error: socket hangup');
  });
});
