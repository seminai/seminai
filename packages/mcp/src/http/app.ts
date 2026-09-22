import express, { type Express, type Request, type Response } from 'express';
import type { HttpMcpConfig } from '../http-config.js';
import { createOauthRouter } from '../oauth/router.js';
import type { OauthStore } from '../oauth/types.js';
import { applyCors } from './cors.js';
import { handleMcpRequest } from './mcp-handler.js';

export function createHttpApp(config: HttpMcpConfig, store: OauthStore): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use((request, response, next) => {
    applyCors(request, response, config.allowedOrigins);
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use(createOauthRouter(config, store));
  app.head('/mcp', (_req, res) => {
    res.setHeader('MCP-Protocol-Version', '2025-06-18');
    res.status(200).end();
  });
  app.get('/mcp', (req, res) => void handleMcp(req, res, config, store));
  app.post('/mcp', (req, res) => void handleMcp(req, res, config, store));
  app.delete('/mcp', (req, res) => void handleMcp(req, res, config, store));
  return app;
}

async function handleMcp(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  store: OauthStore,
): Promise<void> {
  try {
    await handleMcpRequest(request, response, config, store);
  } catch (error) {
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: (error as Error).message },
        id: null,
      });
    }
  }
}
