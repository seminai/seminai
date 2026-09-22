import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { createSeminaiMcpServer } from '../server';
import { GET_LABEL_TOOL_NAME } from '../tools/labels';

interface FakeBackend {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

function startFakeBackend(
  router: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<FakeBackend> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? '');
    router(req, res);
  });
  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveStart({
        port: addr.port,
        hits,
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
  return { client };
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

describe('seminai_get_label end-to-end via MCP', () => {
  let backend: FakeBackend;

  afterEach(async () => {
    if (backend) await backend.close();
  });

  it('cache HIT: returns source=seminai_cache and never hits /labels/extract', async () => {
    backend = await startFakeBackend((req, res) => {
      const url = req.url ?? '';
      if (url.startsWith('/labels/by-product')) {
        return jsonResponse(res, 200, {
          status: 'success',
          data: { id: 'L1', productName: 'Sacron 45 WG', registrationNumber: '12916' },
        });
      }
      jsonResponse(res, 500, { error: 'unexpected route in this test' });
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: 'Sacron 45 WG',
        registrationNumber: '12916',
      },
    });
    expect(result.isError ?? false).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const body = JSON.parse(content[0].text);
    expect(body.source).toBe('seminai_cache');
    expect(backend.hits).toHaveLength(1);
    expect(backend.hits[0]).toContain('/labels/by-product');
    expect(backend.hits.some((h) => h.startsWith('/labels/extract'))).toBe(false);
  });

  it('cache MISS + allowLiveSianExtraction omitted (defaults false): returns gate error and never calls /labels/extract', async () => {
    backend = await startFakeBackend((req, res) => {
      const url = req.url ?? '';
      if (url.startsWith('/labels/by-product')) {
        return jsonResponse(res, 404, {
          status: 'error',
          message: 'Label extraction not found',
          code: 'LABEL_NOT_FOUND',
        });
      }
      jsonResponse(res, 500, { error: 'should not be called' });
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: 'NONEXISTENT',
        registrationNumber: '99999',
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('not found in Seminai cache');
    expect(content[0].text).toContain('allowLiveSianExtraction=true');
    expect(backend.hits.some((h) => h.startsWith('/labels/extract'))).toBe(false);
  });

  it('cache MISS + allowLiveSianExtraction=true: cascades to /labels/extract and reports source=sian_live_extraction', async () => {
    backend = await startFakeBackend((req, res) => {
      const url = req.url ?? '';
      if (url.startsWith('/labels/by-product')) {
        return jsonResponse(res, 404, {
          status: 'error',
          message: 'Label extraction not found',
          code: 'LABEL_NOT_FOUND',
        });
      }
      if (url.startsWith('/labels/extract')) {
        return jsonResponse(res, 200, {
          status: 'success',
          data: {
            url: 'https://sian.example/label.pdf',
            label: { activeSubstance: 'glifosato' },
            text: 'raw...',
          },
        });
      }
      jsonResponse(res, 500, { error: 'unexpected route' });
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: 'Sacron 45 WG',
        registrationNumber: '12916',
        allowLiveSianExtraction: true,
      },
    });
    expect(result.isError ?? false).toBe(false);
    const content = result.content as Array<{ type: string; text: string }>;
    const body = JSON.parse(content[0].text);
    expect(body.source).toBe('sian_live_extraction');
    expect(backend.hits).toHaveLength(2);
    expect(backend.hits[0]).toContain('/labels/by-product');
    expect(backend.hits[1]).toContain('/labels/extract');
  });

  it('cache MISS + SIAN 404 returns specific not-found message', async () => {
    backend = await startFakeBackend((_req, res) => {
      jsonResponse(res, 404, {
        status: 'error',
        message: 'Label not found',
        code: 'LABEL_NOT_FOUND',
      });
    });
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: GET_LABEL_TOOL_NAME,
      arguments: {
        productName: 'Sacron 45 WG',
        registrationNumber: '12916',
        allowLiveSianExtraction: true,
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('SIAN returned 404');
  });
});
