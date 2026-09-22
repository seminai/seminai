import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createSeminaiMcpServer } from '../server';
import { LIST_COMPANIES_TOOL_NAME } from '../tools/companies';
import { LIST_FIELDS_TOOL_NAME } from '../tools/fields';
import { LIST_MACHINES_TOOL_NAME } from '../tools/machines';
import { LIST_PRODUCTION_UNITS_TOOL_NAME } from '../tools/production-units';
import { LIST_WAREHOUSES_TOOL_NAME } from '../tools/warehouses';
import { LIST_WORKSPACES_TOOL_NAME } from '../tools/workspaces';
import { BDF_GET_DOSES_TOOL_NAME, BDF_LIST_CROPS_TOOL_NAME, BDF_SEARCH_PRODUCTS_TOOL_NAME } from '../tools/bdf';
import { LIST_MY_JOBS_TOOL_NAME, LIST_MY_PRODUCTS_TOOL_NAME, LIST_MY_VERIFIED_JOBS_TOOL_NAME, SEARCH_MENTIONS_TOOL_NAME } from '../tools/stock-jobs';
import { DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME, DISCIPLINARI_EXPIRING_SOON_TOOL_NAME, DISCIPLINARI_LIST_TOOL_NAME, DISCIPLINARI_SEARCH_TOOL_NAME } from '../tools/disciplinari';

interface FakeBackend {
  port: number;
  close(): Promise<void>;
}

function startFakeBackend(handler: (path: string) => unknown): Promise<FakeBackend> {
  const server: Server = createServer((req, res) => {
    const result = handler(req.url ?? '');
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  });
  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveStart({
        port: addr.port,
        close: () =>
          new Promise<void>((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

async function setupMcp(backendPort: number) {
  const mcpServer = createSeminaiMcpServer({
    config: {
      apiBaseUrl: `http://127.0.0.1:${backendPort}`,
      apiToken: 'integration-jwt',
      serverName: 'seminai-test',
      serverVersion: '0.0.1-test',
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'seminai-mcp-test-client', version: '0.0.1' },
    { capabilities: {} },
  );
  await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
  return { client, mcpServer };
}
describe('seminai-mcp end-to-end (MCP client ↔ server ↔ HTTP backend)', () => {
  let backend: FakeBackend;

  afterEach(async () => {
    if (backend) await backend.close();
  });

  it('exposes the full Catalog wave via listTools', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        LIST_COMPANIES_TOOL_NAME,
        LIST_WORKSPACES_TOOL_NAME,
        LIST_FIELDS_TOOL_NAME,
        LIST_PRODUCTION_UNITS_TOOL_NAME,
        LIST_MACHINES_TOOL_NAME,
        LIST_WAREHOUSES_TOOL_NAME,
        'qdc_list_companies',
        'qdc_get_operations',
        'qdc_set_carico_agrofarmaco',
      ]),
    );
    const machinesTool = tools.tools.find((t) => t.name === LIST_MACHINES_TOOL_NAME);
    expect(machinesTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { companyId: expect.any(Object) },
      required: expect.arrayContaining(['companyId']),
    });
  });

  it('callTool returns companies fetched from the backend', async () => {
    const expectedCompanies = [
      { id: 'c1', name: 'Acme Farms' },
      { id: 'c2', name: 'Beta Coop' },
    ];
    backend = await startFakeBackend((path) => {
      expect(path).toBe('/companies');
      return expectedCompanies;
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: LIST_COMPANIES_TOOL_NAME,
      arguments: {},
    });
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe('text');
    expect(JSON.parse(content[0].text)).toEqual(expectedCompanies);
    expect(result.isError ?? false).toBe(false);
  });

  it('callTool list_machines forwards companyId to backend path', async () => {
    const expectedMachines = [{ id: 'm1', name: 'Tractor' }];
    const seenPaths: string[] = [];
    backend = await startFakeBackend((path) => {
      seenPaths.push(path);
      return expectedMachines;
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: LIST_MACHINES_TOOL_NAME,
      arguments: { companyId: 'comp-xyz' },
    });
    expect(seenPaths).toEqual(['/machines/company/comp-xyz']);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual(expectedMachines);
    expect(result.isError ?? false).toBe(false);
  });

  it('callTool list_machines returns isError when companyId is missing (zod validation)', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: LIST_MACHINES_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/companyId/);
    expect(content[0].text).toMatch(/Required|invalid_type/);
  });

  it('exposes BDF wave tools alongside Catalog wave', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        BDF_LIST_CROPS_TOOL_NAME,
        BDF_SEARCH_PRODUCTS_TOOL_NAME,
        BDF_GET_DOSES_TOOL_NAME,
      ]),
    );
    const dosesTool = tools.tools.find((t) => t.name === BDF_GET_DOSES_TOOL_NAME);
    expect(dosesTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        codprod: expect.any(Object),
        coltura: expect.any(Object),
      },
      required: expect.arrayContaining(['codprod', 'coltura']),
    });
  });

  it('callTool bdf_get_doses forwards required and optional query params to backend', async () => {
    const seenUrls: string[] = [];
    backend = await startFakeBackend((path) => {
      seenUrls.push(path);
      return { doses: [{ min: 1, max: 2, unit: 'L/ha' }] };
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: BDF_GET_DOSES_TOOL_NAME,
      arguments: {
        codprod: 'P123',
        coltura: 'GR',
        avversita: 'AV9',
        datatrattamento: '2026-05-10',
      },
    });
    expect(result.isError ?? false).toBe(false);
    expect(seenUrls).toHaveLength(1);
    const parsed = new URL(`http://x${seenUrls[0]}`);
    expect(parsed.pathname).toBe('/bdf/dosi');
    expect(parsed.searchParams.get('codprod')).toBe('P123');
    expect(parsed.searchParams.get('coltura')).toBe('GR');
    expect(parsed.searchParams.get('avversita')).toBe('AV9');
    expect(parsed.searchParams.get('datatrattamento')).toBe('2026-05-10');
  });

  it('exposes Stock & Job wave tools alongside other waves', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        LIST_MY_PRODUCTS_TOOL_NAME,
        LIST_MY_JOBS_TOOL_NAME,
        LIST_MY_VERIFIED_JOBS_TOOL_NAME,
        SEARCH_MENTIONS_TOOL_NAME,
      ]),
    );
    const mentionsTool = tools.tools.find((t) => t.name === SEARCH_MENTIONS_TOOL_NAME);
    expect(mentionsTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { q: expect.any(Object), types: expect.any(Object) },
      required: expect.arrayContaining(['q']),
    });
  });

  it('callTool search_mentions forwards q and types to backend query string', async () => {
    const seenUrls: string[] = [];
    backend = await startFakeBackend((path) => {
      seenUrls.push(path);
      return { status: 'success', data: [{ id: 'c1', type: 'company', label: 'azienda-demo' }] };
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: SEARCH_MENTIONS_TOOL_NAME,
      arguments: { q: 'azienda-demo', types: 'company' },
    });
    expect(result.isError ?? false).toBe(false);
    const parsed = new URL(`http://x${seenUrls[0]}`);
    expect(parsed.pathname).toBe('/mentions/search');
    expect(parsed.searchParams.get('q')).toBe('azienda-demo');
    expect(parsed.searchParams.get('types')).toBe('company');
  });

  it('exposes Disciplinari wave tools alongside other waves', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        DISCIPLINARI_LIST_TOOL_NAME,
        DISCIPLINARI_SEARCH_TOOL_NAME,
        DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME,
        DISCIPLINARI_EXPIRING_SOON_TOOL_NAME,
      ]),
    );
    const checkValidityTool = tools.tools.find(
      (t) => t.name === DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME,
    );
    expect(checkValidityTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { region: expect.any(Object), year: expect.any(Object) },
      required: expect.arrayContaining(['region', 'year']),
    });
  });});
