import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createSeminaiMcpServer } from '../server';

describe('createSeminaiMcpServer', () => {
  it('returns an McpServer instance with the configured identity', () => {
    const actual = createSeminaiMcpServer({
      config: {
        apiBaseUrl: 'http://localhost:8081',
        apiToken: 'jwt-token',
        serverName: 'seminai-test',
        serverVersion: '1.2.3',
      },
    });
    expect(actual).toBeInstanceOf(McpServer);
  });
});
