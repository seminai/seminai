import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFarmTools } from './farm.js';
import type { ToolDependencies } from './types.js';
export type { ToolDependencies } from './types.js';
/** The public connector only exposes scoped reads and proposals, never legacy write tools. */
export function registerAllTools(server: McpServer, deps: ToolDependencies): void {
  registerFarmTools(server, deps);
}
