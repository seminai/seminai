import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSeminaiMcpServer } from '../server';

const LIVE = process.env.SEMINAI_LIVE_TEST === '1';
export const describeLive = LIVE ? describe : describe.skip;
export const LIVE_BASE_URL = process.env.SEMINAI_LIVE_BASE_URL ?? 'http://localhost:8081';

interface LoginResponse {
  readonly status: string;
  readonly data: { readonly token: string; readonly user: { readonly id: string; readonly email: string } };
}

async function login(): Promise<string> {
  const email = process.env.SEMINAI_LIVE_EMAIL ?? '';
  const password = process.env.SEMINAI_LIVE_PASSWORD ?? '';
  if (!email || !password) {
    throw new Error('SEMINAI_LIVE_EMAIL and SEMINAI_LIVE_PASSWORD must be set');
  }
  const response = await fetch(`${LIVE_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login failed with status ${response.status}`);
  const json = (await response.json()) as LoginResponse;
  return json.data.token;
}

/** Create an in-memory MCP client bound to the explicitly configured local backend. */
export async function createLiveClient(): Promise<{ readonly client: Client; readonly token: string }> {
  const token = await login();
  const server = createSeminaiMcpServer({
    config: {
      apiBaseUrl: LIVE_BASE_URL,
      apiToken: token,
      serverName: 'seminai-live',
      serverVersion: '0.0.1-live',
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'seminai-mcp-live-client', version: '0.0.1' },
    { capabilities: {} },
  );
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, token };
}

export function parseToolJson(content: unknown): unknown {
  const blocks = content as Array<{ readonly type: string; readonly text: string }>;
  return JSON.parse(blocks[0].text) as unknown;
}
