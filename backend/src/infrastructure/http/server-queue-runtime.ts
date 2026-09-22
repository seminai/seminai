import { Server as SocketServer } from 'socket.io';
import { getLabelExtractionQueue } from '../queue/LabelExtractionQueue';
import { getDosageAgentQueue } from '../queue/DosageAgentQueue';
import { getDosageSubagentQueue } from '../queue/DosageSubagentQueue';
import { getConformityCheckerQueue } from '../queue/ConformityCheckerQueue';
import { getProductJobCreationQueue } from '../queue/ProductJobCreationQueue';
import { getRulePdfVectorizationQueue } from '../queue/RulePdfVectorizationQueue';
import { getOnboardingExtractionQueue } from '../queue/OnboardingExtractionQueue';
import { getChatExtractionQueue } from '../queue/ChatExtractionQueue';
import { getBatchExtractionQueue } from '../queue/BatchExtractionQueue';
import { getPreclassificationQueue } from '../queue/PreclassificationQueue';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { SocketConnectionManager } from './middlewares/socket-connection-manager';
import { startQueueKeepAliveService } from '../services/queue-keepalive.service';
import { setGlobalSocketIO } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { logger } from '../services/logger.service';
import { setupSocketHandlers } from './server-socket-handlers';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';

export function initializeQueuesAndSockets(io: SocketServer): void {
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
    if (shouldStartQueueWorkers()) rulePdfQueue.startWorker();
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
