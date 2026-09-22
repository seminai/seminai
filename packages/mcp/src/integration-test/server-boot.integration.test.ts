import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER_ENTRY = resolve(__dirname, '../cli.ts');
const TSX_BIN = resolve(__dirname, '../../node_modules/.bin/tsx');

function spawnServer(env: NodeJS.ProcessEnv) {
  return spawn(TSX_BIN, [SERVER_ENTRY], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

describe('seminai-mcp server boot', () => {
  it('starts and announces readiness on stderr when env is valid', async () => {
    const child = spawnServer({
      SEMINAI_API_BASE_URL: 'http://localhost:8081',
      SEMINAI_API_TOKEN: 'jwt-token',
    });
    const stderrChunks: string[] = [];
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
    const ready = await new Promise<boolean>((resolveReady) => {
      const timeout = setTimeout(() => resolveReady(false), 5000);
      child.stderr.on('data', (chunk: Buffer) => {
        if (chunk.toString('utf8').includes('[seminai-mcp] connected')) {
          clearTimeout(timeout);
          resolveReady(true);
        }
      });
    });
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    expect(ready).toBe(true);
    expect(stderrChunks.join('')).toContain('api=http://localhost:8081');
  });

  it('exits with code 1 when required env is missing', async () => {
    const child = spawnServer({
      SEMINAI_API_BASE_URL: '',
      SEMINAI_API_TOKEN: '',
    });
    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.once('exit', (code) => resolveExit(code));
    });
    expect(exitCode).toBe(1);
  });
});
