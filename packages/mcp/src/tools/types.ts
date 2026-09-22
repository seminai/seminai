import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SeminaiHttpClient } from '../client/http.js';

export interface ToolDependencies {
  http: SeminaiHttpClient;
  /**
   * Timeout in ms reserved for LLM-bound agent endpoints (/agent-chat/*).
   * Used by dosage-proposal tools as per-request override on the http client.
   */
  agentTimeoutMs: number;
}

export type ToolRegistrar = (server: McpServer, deps: ToolDependencies) => void;

export function jsonContent(data: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function errorContent(message: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
