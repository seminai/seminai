import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { HttpMcpConfig } from '../http-config.js';
import { createSeminaiMcpServer } from '../server.js';
import type { AccessTokenRecord, OauthStore } from '../oauth/types.js';
import { wwwAuthenticate } from './cors.js';

interface LiveSession {
  readonly transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, LiveSession>();

export async function handleMcpRequest(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  store: OauthStore,
): Promise<void> {
  const identity = await requireAccessToken(request, response, config, store);
  if (!identity) {
    return;
  }
  const sessionId = headerValue(request, 'mcp-session-id');
  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId)?.transport.handleRequest(request, response, request.body);
    return;
  }
  if (request.method === 'POST' && isInitializeRequest(request.body)) {
    await startSession(request, response, config, identity);
    return;
  }
  response.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Bad Request: missing or expired MCP session' },
    id: null,
  });
}

async function startSession(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  identity: AccessTokenRecord,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport });
    },
  });
  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) {
      sessions.delete(id);
    }
  };
  const server = createSeminaiMcpServer({
    config: {
      apiBaseUrl: config.apiBaseUrl,
      apiToken: identity.seminaiJwt,
      serverName: config.serverName,
      serverVersion: config.serverVersion,
      httpTimeoutMs: config.httpTimeoutMs,
      agentTimeoutMs: config.agentTimeoutMs,
    },
  });
  await server.connect(transport);
  await transport.handleRequest(request, response, request.body);
}

async function requireAccessToken(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  store: OauthStore,
): Promise<AccessTokenRecord | null> {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const record = token ? await store.getAccessToken(token) : null;
  if (record) {
    return record;
  }
  response.setHeader('WWW-Authenticate', wwwAuthenticate(config));
  response.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized',
    },
    id: null,
    _meta: { 'mcp/www_authenticate': wwwAuthenticate(config) },
  });
  return null;
}

function headerValue(request: Request, name: string): string | undefined {
  const raw = request.headers[name];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function isInitializeRequest(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && 'method' in body && body.method === 'initialize'
  );
}
