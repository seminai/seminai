#!/usr/bin/env node
import { startSeminaiMcpServer } from './server.js';

startSeminaiMcpServer().catch((err) => {
  process.stderr.write(`[seminai-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
