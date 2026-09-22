import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createSeminaiMcpServer } from '../server';
import { LIST_COMPANIES_TOOL_NAME } from '../tools/companies';
import { DISCIPLINARI_SEARCH_TOOL_NAME } from '../tools/disciplinari';
import { CONFIRM_DOSAGE_PLAN_TOOL_NAME, GET_PROPOSAL_STATE_TOOL_NAME, PROPOSE_DOSAGE_PLAN_TOOL_NAME, REJECT_DOSAGE_PLAN_TOOL_NAME } from '../tools/dosage-proposal';

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

  it('callTool disciplinari_search forwards region and year to backend query string', async () => {
    const seenUrls: string[] = [];
    backend = await startFakeBackend((path) => {
      seenUrls.push(path);
      return { status: 'success', data: [] };
    });
    const { client } = await setupMcp(backend.port);
    await client.callTool({
      name: DISCIPLINARI_SEARCH_TOOL_NAME,
      arguments: { region: 'Lombardia', year: 2025 },
    });
    const parsed = new URL(`http://x${seenUrls[0]}`);
    expect(parsed.pathname).toBe('/disciplinari/search');
    expect(parsed.searchParams.get('region')).toBe('Lombardia');
    expect(parsed.searchParams.get('year')).toBe('2025');
  });

  it('exposes Dosage Proposal wave tools (propose/confirm/reject/state)', async () => {
    backend = await startFakeBackend(() => []);
    const { client } = await setupMcp(backend.port);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        PROPOSE_DOSAGE_PLAN_TOOL_NAME,
        CONFIRM_DOSAGE_PLAN_TOOL_NAME,
        REJECT_DOSAGE_PLAN_TOOL_NAME,
        GET_PROPOSAL_STATE_TOOL_NAME,
      ]),
    );
    const proposeTool = tools.tools.find((t) => t.name === PROPOSE_DOSAGE_PLAN_TOOL_NAME);
    expect(proposeTool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { threadId: expect.any(Object), message: expect.any(Object) },
      required: expect.arrayContaining(['threadId', 'message']),
    });
  });

  it('callTool propose_dosage_plan POSTs body to /agent-chat/message and unwraps the envelope', async () => {
    const agentResponse = {
      status: 'REQUIRES_APPROVAL',
      message: 'Confermi la creazione di 3 trattamenti?',
      pendingToolCalls: [
        {
          name: 'create_treatment_jobs',
          args: { persist: true },
          riskLevel: 'medium',
          riskScore: 35,
          riskReason: 'base score for create_treatment_jobs',
        },
      ],
      proposalSummary: {
        tool: 'create_treatment_jobs',
        totalJobs: 3,
        unitsCount: 1,
        units: [],
        complianceViolationsCount: 0,
        hasComplianceViolations: false,
      },
    };
    const seenRequests: Array<{ method: string; path: string; body: unknown }> = [];
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw.length > 0 ? JSON.parse(raw) : undefined;
        seenRequests.push({ method: req.method ?? '', path: req.url ?? '', body });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'success', data: agentResponse }));
      });
    });
    const port = await new Promise<number>((resolveStart) => {
      server.listen(0, '127.0.0.1', () => {
        resolveStart((server.address() as AddressInfo).port);
      });
    });
    backend = { port, close: () => new Promise((r) => server.close(() => r())) };
    const { client } = await setupMcp(backend.port);

    const result = await client.callTool({
      name: PROPOSE_DOSAGE_PLAN_TOOL_NAME,
      arguments: {
        threadId: 'thread-int-1',
        message: 'Calcola trattamenti per UP X',
        mentions: [{ type: 'product', id: 'prod-1', label: 'Karate Zeon' }],
      },
    });

    expect(result.isError ?? false).toBe(false);
    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0].method).toBe('POST');
    expect(seenRequests[0].path).toBe('/agent-chat/message');
    expect(seenRequests[0].body).toEqual({
      threadId: 'thread-int-1',
      message: 'Calcola trattamenti per UP X',
      mentions: [{ type: 'product', id: 'prod-1', label: 'Karate Zeon' }],
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual(agentResponse);
  });

  it('callTool confirm_dosage_plan POSTs to /agent-chat/approve with threadId derived from proposalId', async () => {
    const seenRequests: Array<{ path: string; body: unknown }> = [];
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw.length > 0 ? JSON.parse(raw) : undefined;
        seenRequests.push({ path: req.url ?? '', body });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ status: 'success', data: { status: 'COMPLETED' } }));
      });
    });
    const port = await new Promise<number>((resolveStart) => {
      server.listen(0, '127.0.0.1', () => {
        resolveStart((server.address() as AddressInfo).port);
      });
    });
    backend = { port, close: () => new Promise((r) => server.close(() => r())) };
    const { client } = await setupMcp(backend.port);

    const result = await client.callTool({
      name: CONFIRM_DOSAGE_PLAN_TOOL_NAME,
      arguments: { proposalId: 'thread-int-1' },
    });

    expect(result.isError ?? false).toBe(false);
    expect(seenRequests[0].path).toBe('/agent-chat/approve');
    expect(seenRequests[0].body).toEqual({ threadId: 'thread-int-1' });
  });

  it('callTool get_proposal_state GETs /agent-chat/state/:proposalId', async () => {
    const seenPaths: string[] = [];
    backend = await startFakeBackend((path) => {
      seenPaths.push(path);
      return { status: 'success', data: { status: 'REQUIRES_APPROVAL' } };
    });
    const { client } = await setupMcp(backend.port);

    const result = await client.callTool({
      name: GET_PROPOSAL_STATE_TOOL_NAME,
      arguments: { proposalId: 'thread-int-1' },
    });

    expect(result.isError ?? false).toBe(false);
    expect(seenPaths).toEqual(['/agent-chat/state/thread-int-1']);
  });

  it('callTool returns isError content when backend responds with non-2xx', async () => {
    const server: Server = createServer((_req, res) => {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'expired' }));
    });
    const port = await new Promise<number>((resolveStart) => {
      server.listen(0, '127.0.0.1', () => {
        resolveStart((server.address() as AddressInfo).port);
      });
    });
    backend = {
      port,
      close: () => new Promise((r) => server.close(() => r())),
    };
    const { client } = await setupMcp(backend.port);
    const result = await client.callTool({
      name: LIST_COMPANIES_TOOL_NAME,
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('401');
  });});
