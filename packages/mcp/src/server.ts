import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SeminaiHttpClient } from './client/http.js';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_HTTP_TIMEOUT_MS,
  loadConfig,
  type SeminaiMcpConfig,
} from './config.js';
import { registerAllTools, type ToolDependencies } from './tools/index.js';

/**
 * Accepts a config without the timeout fields (callers that build the config
 * inline can omit them and rely on the constants from config.ts).
 */
export type CreateServerConfig = Omit<SeminaiMcpConfig, 'httpTimeoutMs' | 'agentTimeoutMs'> & {
  httpTimeoutMs?: number;
  agentTimeoutMs?: number;
};

export interface CreateServerOptions {
  config: CreateServerConfig;
  http?: SeminaiHttpClient;
}

export function createSeminaiMcpServer(options: CreateServerOptions): McpServer {
  const server = new McpServer({
    name: options.config.serverName,
    version: options.config.serverVersion,
  });
  const httpTimeoutMs = options.config.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  const agentTimeoutMs = options.config.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const http =
    options.http ??
    new SeminaiHttpClient({
      baseUrl: options.config.apiBaseUrl,
      token: options.config.apiToken,
      timeoutMs: httpTimeoutMs,
    });
  const deps: ToolDependencies = { http, agentTimeoutMs };
  registerAllTools(server, deps);
  return server;
}

export async function startSeminaiMcpServer(): Promise<void> {
  const config = loadConfig();
  const server = createSeminaiMcpServer({ config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[seminai-mcp] connected (api=${config.apiBaseUrl}, name=${config.serverName})\n`,
  );
}
