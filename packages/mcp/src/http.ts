#!/usr/bin/env node
import { loadHttpConfig } from './http-config.js';
import { createHttpApp } from './http/app.js';
import { MemoryOauthStore } from './oauth/memory-store.js';

export async function startHttpServer(): Promise<void> {
  const config = loadHttpConfig();
  const store = new MemoryOauthStore();
  const app = createHttpApp(config, store);
  await new Promise<void>((resolve) => {
    app.listen(config.port, () => resolve());
  });
  process.stderr.write(
    `[seminai-mcp] http listening on :${config.port} (api=${config.apiBaseUrl}, resource=${config.resourceUrl})\n`,
  );
}

startHttpServer().catch((err) => {
  process.stderr.write(`[seminai-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
