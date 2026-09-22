import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createCorsMiddleware, createCorsOptions } from './middlewares/corsPolicy';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import compression from 'compression';
import helmet from 'helmet';
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
import { getDosageSubagentQueue } from '../queue/DosageSubagentQueue';
import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';
import { getProductJobCreationQueue } from '../queue/ProductJobCreationQueue';
import { getRulePdfVectorizationQueue } from '../queue/RulePdfVectorizationQueue';
import { getOnboardingExtractionQueue } from '../queue/OnboardingExtractionQueue';
import { getChatExtractionQueue } from '../queue/ChatExtractionQueue';
import { getBatchExtractionQueue } from '../queue/BatchExtractionQueue';
import { getPreclassificationQueue } from '../queue/PreclassificationQueue';
import { getQdcSyncQueue } from '../queue/QdcSyncQueue';
import { getPreclassificationOwner } from '../services/extraction/preclassification-store';
import { socketAuthMiddleware, AuthenticatedSocket } from './middlewares/socket-auth.middleware';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { SocketConnectionManager } from './middlewares/socket-connection-manager';
import { startQueueKeepAliveService } from '../services/queue-keepalive.service';
import { setGlobalSocketIO } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import {
  flushAllWorkingMemory,
  setWorkingMemoryRepository,
} from '../services/agents/dosage_agent_react/working-memory';
import { prisma } from '../repositories/Prisma';
import { PrismaWorkingMemoryRepository } from '../repositories/PrismaWorkingMemoryRepository';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisConnection, closeRedisConnection } from '../queue/redis.connection';
import { logger } from '../services/logger.service';
import { getAnalyticsService } from '../services/analytics/analytics-service.singleton';

logger.info('All modules loaded');

setWorkingMemoryRepository(new PrismaWorkingMemoryRepository(prisma.agentWorkingMemory));
getAnalyticsService(); // eager init so the enabled/no-op status is logged at boot

const app = express();
const port = Number(process.env.PORT) || 8081;
const host = process.env.HOST || '0.0.0.0';
logger.info(`Will listen on ${host}:${port}`);

// Enable compression for all responses (gzip/deflate)
// Note: This compresses RESPONSES only, not request bodies
// Request body compression would require custom implementation
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

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const corsOptions = createCorsOptions();

app.use(createCorsMiddleware());

// Increase limit for job-verification-agent endpoints (50MB)
// This must be before the default json parser to take precedence
app.use('/job-verification-agent', express.json({ limit: '50mb' }));

// Increase limit for bulk endpoints (5MB)
app.use('/fields/bulk', express.json({ limit: '5mb' }));
app.use('/production-units/bulk', express.json({ limit: '5mb' }));

// Increase limit for onboarding bulk-create (5MB)
app.use('/onboarding', express.json({ limit: '5mb' }));

// Default JSON parser with standard limit (100kb) for all other routes
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

app.get('/', (_: Request, res: Response) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

httpServer.listen(port, host, () => {
  logger.info(`Server running on http://${host}:${port}`);
  logger.info(`Swagger UI available at http://localhost:${port}/api-docs`);

  initializeQueuesAndSockets(io);
});

function initializeQueuesAndSockets(io: SocketServer): void {
  try {
    logger.info('Initializing BullMQ queues...');
    getLabelExtractionQueue();
    const dosageQueue = getDosageAgentQueue();
    // SKIP_QUEUE=true skips the spawn_subagent worker boot — useful in dev
    // without Redis. The tool itself short-circuits to a "disabled" reply.
    if (process.env.SKIP_QUEUE !== 'true') {
      getDosageSubagentQueue();
    }
    const conformityQueue = getConformityCheckerQueue();
    const productJobCreationQueue = getProductJobCreationQueue();
    const onboardingQueue = getOnboardingExtractionQueue();
    getChatExtractionQueue();
    getBatchExtractionQueue();
    getPreclassificationQueue();

    const rulePdfQueue = getRulePdfVectorizationQueue();
    rulePdfQueue.startWorker();
    logger.info('All BullMQ queues initialized');

    setupSocketHandlers(io, dosageQueue, conformityQueue, productJobCreationQueue, onboardingQueue);
    setupQueueEventListeners(
      io,
      dosageQueue,
      conformityQueue,
      productJobCreationQueue,
      onboardingQueue,
    );

    startQueueKeepAliveService();
    logger.info('Queue keep-alive service started');
  } catch (error) {
    logger.error('Failed to initialize queues — HTTP server is still running', {
      error: String(error),
    });
  }
}

function setupSocketHandlers(
  io: SocketServer,
  dosageQueue: ReturnType<typeof getDosageAgentQueue>,
  conformityQueue: ReturnType<typeof getConformityCheckerQueue>,
  productJobCreationQueue: ReturnType<typeof getProductJobCreationQueue>,
  onboardingQueue: ReturnType<typeof getOnboardingExtractionQueue>,
): void {
  const connectionManager = SocketConnectionManager.getInstance();

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.userId) {
      console.error(
        `[SOCKET.IO] Unauthenticated connection attempt from ${socket.id}. Disconnecting.`,
      );
      socket.emit('error', {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
      socket.disconnect();
      return;
    }

    const userId = socket.userId;
    console.log(`[SOCKET.IO] Client connected: ${socket.id} (user: ${userId})`);

    const canConnect = connectionManager.canUserConnect(userId);
    if (!canConnect.allowed) {
      console.warn(
        `[SOCKET.IO] User ${userId} exceeded max connections. Disconnecting socket ${socket.id}`,
      );
      socket.emit('error', {
        code: 'MAX_CONNECTIONS_EXCEEDED',
        message: canConnect.reason,
      });
      socket.disconnect();
      return;
    }

    socket.on('join:job', async (jobId: string) => {
      if (connectionManager.isJobCompleted(jobId)) {
        socket.emit('error', {
          code: 'JOB_COMPLETED',
          message: 'This job is already completed. Cannot join.',
        });
        return;
      }

      try {
        let status: { state: string; data?: { userId: string } };
        let jobQueue: {
          getJobStatus(id: string): Promise<{ state: string; data?: { userId: string } }>;
        } | null = null;
        try {
          status = await dosageQueue.getJobStatus(jobId);
          jobQueue = dosageQueue;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!message.includes('not found')) {
            throw error;
          }
          try {
            status = await conformityQueue.getJobStatus(jobId);
            jobQueue = conformityQueue;
          } catch (error2) {
            const message2 = error2 instanceof Error ? error2.message : '';
            if (!message2.includes('not found')) {
              throw error2;
            }
            try {
              status = await productJobCreationQueue.getJobStatus(jobId);
              jobQueue = productJobCreationQueue;
            } catch (error3) {
              const message3 = error3 instanceof Error ? error3.message : '';
              if (!message3.includes('not found')) {
                throw error3;
              }
              status = await onboardingQueue.getJobStatus(jobId);
              jobQueue = onboardingQueue;
            }
          }
        }

        if (status.data?.userId && status.data.userId !== userId) {
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this job',
          });
          return;
        }

        if (status.state === 'completed' || status.state === 'failed') {
          if (jobQueue) {
            await connectionManager.scheduleJobCompletion(jobId, io, jobQueue);
          }
          socket.emit('error', {
            code: 'JOB_COMPLETED',
            message: `Job is already ${status.state}. Cannot join.`,
          });
          return;
        }

        connectionManager.registerConnection(userId, socket.id, jobId);

        const room = `job:${jobId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined room ${room}`);
        socket.emit('joined:job', { jobId, room });

        DosageLoggerService.getInstance().replayEvents(jobId, socket.id);
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining job ${jobId}:`, error);
        socket.emit('error', {
          code: 'JOB_NOT_FOUND',
          message: error instanceof Error ? error.message : 'Job not found',
        });
      }
    });

    socket.on('leave:job', (jobId: string) => {
      const room = `job:${jobId}`;
      socket.leave(room);
      connectionManager.removeConnection(userId, socket.id);
      console.log(`[SOCKET.IO] User ${userId} left room ${room}`);
      socket.emit('left:job', { jobId, room });
    });

    socket.on('join:chat', async (threadId: string) => {
      try {
        const chat = await prisma.chat.findUnique({
          where: { threadId },
          select: { userId: true },
        });
        if (!chat) {
          socket.emit('error', { code: 'CHAT_NOT_FOUND', message: 'Chat not found' });
          return;
        }
        if (chat.userId !== userId) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized for this chat' });
          return;
        }
        const room = `chat:${threadId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined chat room ${room}`);
        socket.emit('joined:chat', { threadId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining chat ${threadId}:`, error);
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join chat' });
      }
    });

    socket.on('leave:chat', (threadId: string) => {
      const room = `chat:${threadId}`;
      socket.leave(room);
      console.log(`[SOCKET.IO] User ${userId} left chat room ${room}`);
      socket.emit('left:chat', { threadId, room });
    });

    socket.on('join:extraction', async (batchId: string) => {
      try {
        const extraction = await prisma.fileExtraction.findFirst({
          where: { batchId, userId },
          select: { id: true },
        });
        if (!extraction) {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Not authorized for this batch' });
          return;
        }
        const room = `extraction:${batchId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined extraction room ${room}`);
        socket.emit('joined:extraction', { batchId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining extraction ${batchId}:`, error);
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'Failed to join extraction room' });
      }
    });

    socket.on('leave:extraction', (batchId: string) => {
      const room = `extraction:${batchId}`;
      socket.leave(room);
      console.log(`[SOCKET.IO] User ${userId} left extraction room ${room}`);
      socket.emit('left:extraction', { batchId, room });
    });

    socket.on('join:preclassify', async (preclassId: string) => {
      try {
        const ownerId = await getPreclassificationOwner(preclassId);
        if (ownerId !== userId) {
          socket.emit('error', {
            code: 'FORBIDDEN',
            message: 'Not authorized for this preclassification',
          });
          return;
        }
        const room = `preclassify:${preclassId}`;
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined preclassify room ${room}`);
        socket.emit('joined:preclassify', { preclassId, room });
      } catch (error) {
        console.error(`[SOCKET.IO] Error joining preclassify ${preclassId}:`, error);
        socket.emit('error', {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join preclassify room',
        });
      }
    });

    socket.on('leave:preclassify', (preclassId: string) => {
      const room = `preclassify:${preclassId}`;
      socket.leave(room);
      socket.emit('left:preclassify', { preclassId, room });
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET.IO] Client disconnected: ${socket.id}`);
      connectionManager.removeSocketConnections(socket.id);
    });
  });

  connectionManager.cleanupOrphanedConnections(io);
}

function setupQueueEventListeners(
  io: SocketServer,
  dosageQueue: ReturnType<typeof getDosageAgentQueue>,
  conformityQueue: ReturnType<typeof getConformityCheckerQueue>,
  productJobCreationQueue: ReturnType<typeof getProductJobCreationQueue>,
  onboardingQueue: ReturnType<typeof getOnboardingExtractionQueue>,
): void {
  const connectionManager = SocketConnectionManager.getInstance();
  const dosageLogger = DosageLoggerService.getInstance();

  if (dosageQueue.queueEvents) {
    dosageQueue.queueEvents.on('completed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, dosageQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
    dosageQueue.queueEvents.on('failed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, dosageQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
  }

  if (conformityQueue.queueEvents) {
    conformityQueue.queueEvents.on('completed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, conformityQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
    conformityQueue.queueEvents.on('failed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, conformityQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
  }

  if (productJobCreationQueue.queueEvents) {
    productJobCreationQueue.queueEvents.on('completed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, productJobCreationQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
    productJobCreationQueue.queueEvents.on('failed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, productJobCreationQueue);
        dosageLogger.clearBuffer(String(jobId));
      }
    });
  }

  if (onboardingQueue.queueEvents) {
    onboardingQueue.queueEvents.on('completed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, onboardingQueue);
      }
    });
    onboardingQueue.queueEvents.on('failed', async ({ jobId }) => {
      if (jobId) {
        await connectionManager.scheduleJobCompletion(String(jobId), io, onboardingQueue);
      }
    });
  }

  dosageLogger.initialize(io);
  setGlobalSocketIO(io);
}

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
