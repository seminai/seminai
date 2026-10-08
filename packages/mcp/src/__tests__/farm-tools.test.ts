import { createSeminaiMcpServer } from '../server';
import { FileOauthStore } from '../oauth/file-store';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
describe('MCP human confirmation boundary', () => {
  it('advertises no legacy write or approval tool', () => {
    const server = createSeminaiMcpServer({
      config: {
        apiBaseUrl: 'http://127.0.0.1:1',
        apiToken: 'synthetic',
        serverName: 'test',
        serverVersion: '1',
      },
    });
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(Object.keys(tools).sort()).toEqual([
      'seminai_get_connection',
      'seminai_get_operation_status',
      'seminai_propose_operation',
      'seminai_read_farm',
    ]);
  });
  it('persists encrypted grants and consumes authorization codes exactly once across restart', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'seminai-oauth-'));
    try {
      const file = path.join(folder, 'grants.bin');
      const secret = 'synthetic-local-encryption-secret';
      const first = new FileOauthStore(file, secret);
      await first.putAuthCode(
        'once',
        {
          clientId: 'client',
          redirectUri: 'https://chatgpt.com/callback',
          codeChallenge: 'challenge',
          resource: 'https://example.test/mcp',
          seminaiJwt: 'synthetic-scoped-credential',
          userId: 'synthetic-user',
          email: '',
        },
        60,
      );
      expect((await readFile(file)).includes(Buffer.from('synthetic-scoped-credential'))).toBe(
        false,
      );
      const restored = new FileOauthStore(file, secret);
      expect((await restored.takeAuthCode('once'))?.userId).toBe('synthetic-user');
      expect(await new FileOauthStore(file, secret).takeAuthCode('once')).toBeNull();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
