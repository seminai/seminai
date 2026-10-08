#!/usr/bin/env node
import { loadHttpConfig } from './http-config.js';
import { createHttpApp } from './http/app.js';
import { FileOauthStore } from './oauth/file-store.js';
import { resolve } from 'node:path';

export async function startHttpServer(): Promise<void> {
  const config = loadHttpConfig();
  const store = new FileOauthStore(resolve(process.env.MCP_DATA_DIR || './data/mcp', 'oauth.bin'), config.oauthSigningKey);
  const app = createHttpApp(config, store);
  await new Promise<void>((resolve) => {
    app.listen(config.port, process.env.MCP_HOST || '127.0.0.1', () => resolve());
  });
  process.stderr.write(
    `[seminai-mcp] http listening on :${config.port} (api=${config.apiBaseUrl}, resource=${config.resourceUrl})\n`,
  );
}

startHttpServer().catch((err) => {
  process.stderr.write(`[seminai-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});

// A desktop supervisor disappearing must not leave an orphan listener on its fixed port.
if (process.send) process.once('disconnect', () => process.exit(0));
