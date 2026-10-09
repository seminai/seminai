import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSeminaiMcpServer } from './server.js';

const directory = path.join(homedir(), '.seminai');
async function request<T>(
  base: string,
  endpoint: string,
  data?: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`${base}${endpoint}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Seminai: ${response.status}`);
  return ((await response.json()) as { data: T }).data;
}
async function connect(): Promise<void> {
  const discovery = JSON.parse(await readFile(path.join(directory, 'desktop.json'), 'utf8')) as {
    url: string;
  };
  const url = new URL(discovery.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password)
    throw new Error('Invalid local Seminai address');
  const base = url.origin;
  let token = '';
  try {
    const saved = JSON.parse(
      await readFile(path.join(directory, 'claude-connection.json'), 'utf8'),
    ) as { token: string };
    await request(base, '/mcp-api/identity', undefined, saved.token);
    token = saved.token;
  } catch {
    /* A revoked grant must be paired again by the user. */
  }
  if (!token) {
    const pairing = await request<{ id: string; secret: string }>(base, '/mcp-api/pairings', {
      name: 'Claude Desktop',
    });
    const authorizationUrl = `${base}/mcp-connect?pairing=${encodeURIComponent(pairing.id)}`;
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [authorizationUrl]]
        : process.platform === 'win32'
          ? ['rundll32.exe', ['url.dll,FileProtocolHandler', authorizationUrl]]
          : ['xdg-open', [authorizationUrl]];
    const browser = spawn(command, args, { stdio: 'ignore', detached: true });
    browser.on('error', () => process.stderr.write(`Apri ${authorizationUrl} nel browser per autorizzare Seminai.\n`));
    browser.unref();
    process.stderr.write('Autorizza il collegamento nella finestra di Seminai.\n');
    const deadline = Date.now() + 5 * 60_000;
    while (!token && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await request<{ token?: string }>(
        base,
        `/mcp-api/pairings/${pairing.id}/poll`,
        { secret: pairing.secret },
      );
      token = result.token || '';
    }
    if (!token) throw new Error('Collegamento non autorizzato entro cinque minuti');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, 'claude-connection.json'), JSON.stringify({ token }), {
      mode: 0o600,
    });
  }
  const server = createSeminaiMcpServer({
    config: { apiBaseUrl: base, apiToken: token, serverName: 'seminai', serverVersion: '1.0.1' },
  });
  await server.connect(new StdioServerTransport());
}
void connect().catch(() => {
  process.stderr.write('Apri Seminai e riprova il collegamento MCP.\n');
  process.exitCode = 1;
});
