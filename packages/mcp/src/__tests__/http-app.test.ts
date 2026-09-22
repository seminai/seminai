import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpApp } from '../http/app';
import { loadHttpConfig } from '../http-config';
import { MemoryOauthStore } from '../oauth/memory-store';

const config = loadHttpConfig({
  SEMINAI_API_BASE_URL: 'https://seminai-be.example',
  PUBLIC_BASE_URL: 'https://mcp.example',
  MCP_OAUTH_SIGNING_KEY: '1234567890abcdef',
});

async function withApp(run: (base: string) => Promise<void>): Promise<void> {
  const app = createHttpApp(config, new MemoryOauthStore());
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

describe('HTTP MCP app', () => {
  it('serves healthz without auth', async () => {
    await withApp(async (base) => {
      const actual = await fetch(`${base}/healthz`);
      expect(actual.status).toBe(200);
      expect(await actual.json()).toEqual({ status: 'ok' });
    });
  });

  it('publishes OAuth discovery documents', async () => {
    await withApp(async (base) => {
      const as = await fetch(`${base}/.well-known/oauth-authorization-server`);
      const rs = await fetch(`${base}/.well-known/oauth-protected-resource`);
      expect(as.status).toBe(200);
      const asBody = (await as.json()) as {
        authorization_endpoint: string;
        code_challenge_methods_supported: string[];
      };
      const rsBody = (await rs.json()) as { resource: string; authorization_servers: string[] };
      expect(asBody.authorization_endpoint).toBe('https://mcp.example/oauth/authorize');
      expect(asBody.code_challenge_methods_supported).toContain('S256');
      expect(rsBody.resource).toBe('https://mcp.example/mcp');
      expect(rsBody.authorization_servers).toEqual(['https://mcp.example']);
    });
  });

  it('registers a public OAuth client', async () => {
    await withApp(async (base) => {
      const actual = await fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
      });
      expect(actual.status).toBe(201);
      const body = (await actual.json()) as {
        client_id: string;
        token_endpoint_auth_method: string;
      };
      expect(body.client_id).toMatch(/^dcr_/);
      expect(body.token_endpoint_auth_method).toBe('none');
    });
  });

  it('challenges unauthenticated MCP requests', async () => {
    await withApp(async (base) => {
      const actual = await fetch(`${base}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      });
      expect(actual.status).toBe(401);
      expect(actual.headers.get('www-authenticate')).toContain('oauth-protected-resource');
    });
  });

  it('returns MCP-Protocol-Version on HEAD /mcp', async () => {
    await withApp(async (base) => {
      const actual = await fetch(`${base}/mcp`, { method: 'HEAD' });
      expect(actual.status).toBe(200);
      expect(actual.headers.get('mcp-protocol-version')).toBe('2025-06-18');
    });
  });
});
