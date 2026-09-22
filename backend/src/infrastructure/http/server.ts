import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createCorsMiddleware, createCorsOptions } from './middlewares/corsPolicy';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import compression from 'compression';
import { router } from './routes';
import { errorHandler } from './middlewares/error';
import { multerErrorHandler } from '../services/Multer';
import { rateLimiter } from './middlewares/rateLimiter';
import { decompressRequestBody } from './middlewares/decompressRequestBody';
import path from 'path';
import { swaggerSpec } from './swagger';
import { swaggerExtractApiSpec } from './swagger-extract-api';
import { getLabelExtractionQueue } from '../queue/LabelExtractionQueue';
import { getLabelRefreshQueue } from '../queue/LabelRefreshQueue';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';
import { getProductJobCreationQueue } from '../queue/ProductJobCreationQueue';
import { getRulePdfVectorizationQueue } from '../queue/RulePdfVectorizationQueue';
import { getOnboardingExtractionQueue } from '../queue/OnboardingExtractionQueue';
import { getChatExtractionQueue } from '../queue/ChatExtractionQueue';
import { getBatchExtractionQueue } from '../queue/BatchExtractionQueue';
import { getPreclassificationQueue } from '../queue/PreclassificationQueue';
import { getQdcSyncQueue } from '../queue/QdcSyncQueue';
import { socketAuthMiddleware } from './middlewares/socket-auth.middleware';
import { flushAllWorkingMemory, setWorkingMemoryRepository } from '../services/agents/dosage_agent_react/working-memory';
import { prisma } from '../repositories/Prisma';
import { PrismaWorkingMemoryRepository } from '../repositories/PrismaWorkingMemoryRepository';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisConnection, closeRedisConnection } from '../queue/redis.connection';
import { logger } from '../services/logger.service';
import { getAnalyticsService } from '../services/analytics/analytics-service.singleton';
import { initializeQueuesAndSockets } from './server-queue-runtime';
import { applyPersistedInstanceSettings } from '../settings/instanceSettingSingleton';
import { applyLargeJsonBodyParsers } from './jsonBodyLimits';
import { applyAccessHardening } from './applyAccessHardening';
import { mountSpaFallback } from './spaStatic';

logger.info('All modules loaded');

setWorkingMemoryRepository(new PrismaWorkingMemoryRepository(prisma.agentWorkingMemory));
getAnalyticsService(); // eager init so the enabled/no-op status is logged at boot

const app = express();
const port = Number(process.env.PORT) || 8081;
const host = process.env.HOST || '0.0.0.0';
logger.info(`Will listen on ${host}:${port}`);

applyAccessHardening(app);
app.use(
  compression({
    filter: (req: Request, res: Response) => {
      // Compress all responses except SSE streams
      if (req.headers.accept?.includes('text/event-stream')) {
        return false; // Don't compress SSE streams
      }
      return compression.filter(req, res);
    },
    level: 6, // Compression level (1-9, default 6)
    threshold: 1024, // Only compress responses > 1KB
  }),
);

const corsOptions = createCorsOptions();

app.use(createCorsMiddleware());

applyLargeJsonBodyParsers(app);
app.use(express.json({ limit: '100kb' }));

// Decompress request bodies for all endpoints (supports gzip Content-Encoding and X-Payload-Compressed)
app.use(decompressRequestBody);

app.use(cookieParser());
app.use(rateLimiter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  return next();
});

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('JSON Parse Error:', err.message);
    return res.status(400).json({ message: 'Invalid JSON' });
  }
  return next(err);
});

app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.SPA_DIR) {
  app.get('/', (_: Request, res: Response) => {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok' });
});

app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (_req: Request, res: Response) => {
  return res.send(
    swaggerUi.generateHTML(swaggerSpec, {
      customSiteTitle: process.env.APP_NAME || 'Auth Boiler Plate',
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );
});

app.use('/developer/docs', swaggerUi.serve);
app.get('/developer/docs', (_req: Request, res: Response) => {
  return res.send(
    swaggerUi.generateHTML(swaggerExtractApiSpec, {
      customSiteTitle: 'Seminai Extraction API',
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );
});

app.get('/developer', (_req: Request, res: Response) => {
  return res.sendFile(path.join(__dirname, 'public', 'developer', 'index.html'));
});

app.get('/developer/dashboard', (_req: Request, res: Response) => {
  return res.sendFile(path.join(__dirname, 'public', 'developer', 'dashboard.html'));
});

app.use(router);
app.use('/api', router);
if (process.env.SPA_DIR) {
  mountSpaFallback(app, process.env.SPA_DIR);
}

app.use(multerErrorHandler);
app.use(errorHandler);

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
});

// Redis adapter for multi-instance Socket.IO (horizontal scaling)
try {
  const pubClient = getRedisConnection();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.IO Redis adapter configured for horizontal scaling');
} catch (err) {
  logger.warn('Socket.IO Redis adapter failed, falling back to in-memory', { error: String(err) });
}

io.use(socketAuthMiddleware);

void applyPersistedInstanceSettings().finally(() => {
  httpServer.listen(port, host, () => {
    logger.info(`Server running on http://${host}:${port}`);
    logger.info(`Swagger UI available at http://localhost:${port}/api-docs`);
    initializeQueuesAndSockets(io);
  });
});

// ── Graceful Shutdown ──────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 30_000;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`${signal} received — starting graceful shutdown`);
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  try {
    // 1. Stop accepting new connections
    httpServer.close(() => logger.info('HTTP server closed'));
    // 2. Close Socket.IO (disconnects all clients)
    io.close(() => logger.info('Socket.IO closed'));
    // 3. Close BullMQ queues (let in-flight jobs finish)
    const queueClosePromises: Promise<void>[] = [];
    try {
      queueClosePromises.push(getDosageAgentQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getConformityCheckerQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getProductJobCreationQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getOnboardingExtractionQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getLabelExtractionQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getLabelRefreshQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getChatExtractionQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getBatchExtractionQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getPreclassificationQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getRulePdfVectorizationQueue().queue.close());
    } catch {
      /* not initialized */
    }
    try {
      queueClosePromises.push(getQdcSyncQueue().queue.close());
    } catch {
      /* not initialized */
    }
    await Promise.allSettled(queueClosePromises);
    logger.info('BullMQ queues closed');
    // 4. Flush process-local agent working memory before DB disconnect
    await flushAllWorkingMemory();
    logger.info('Agent working memory flushed');
    // 5. Disconnect Prisma
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
    // 6. Close Redis
    closeRedisConnection();
    logger.info('Redis connection closed');
    // 7. Flush pending PostHog analytics events
    await getAnalyticsService().shutdown();
    logger.info('PostHog analytics flushed');
    clearTimeout(forceExit);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: String(error) });
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
