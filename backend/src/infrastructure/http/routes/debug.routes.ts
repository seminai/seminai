import { Router, Request, Response } from 'express';
import { getLabelExtractionQueue } from '../../queue/LabelExtractionQueue';
import { getDosageAgentQueue } from '../../queue/DosageAgentQueue';
import { getRedisConnection } from '../../queue/redis.connection';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

export const debugRouter = Router();

debugRouter.get('/redis-status', ensureAuthenticated, async (_req: Request, res: Response) => {
  try {
    const redis = getRedisConnection();
    const pingResult = await redis.ping();
    const info = await redis.info('server');
    return res.json({
      status: 'ok',
      redis: {
        connected: true,
        ping: pingResult,
        serverInfo: info,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      redis: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

debugRouter.get('/queue-status', ensureAuthenticated, async (_req: Request, res: Response) => {
  try {
    const labelQueue = getLabelExtractionQueue();
    const dosageQueue = getDosageAgentQueue();
    const labelJobs = await labelQueue.queue.getJobCounts();
    const dosageJobs = await dosageQueue.queue.getJobCounts();
    return res.json({
      status: 'ok',
      queues: {
        labelExtraction: {
          name: 'label-extraction',
          jobs: labelJobs,
        },
        dosageAgent: {
          name: 'dosage-agent',
          jobs: dosageJobs,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

debugRouter.get('/worker-health', ensureAuthenticated, async (_req: Request, res: Response) => {
  try {
    const labelQueue = getLabelExtractionQueue();
    const dosageQueue = getDosageAgentQueue();
    const labelWorkerRunning = labelQueue.worker !== null;
    const dosageWorkerRunning = dosageQueue.worker !== null;
    return res.json({
      status: 'ok',
      workers: {
        labelExtraction: {
          running: labelWorkerRunning,
          initialized: !!labelQueue,
        },
        dosageAgent: {
          running: dosageWorkerRunning,
          initialized: !!dosageQueue,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        redisConfigured: !!process.env.UPSTASH_REDIS_REST_URL || !!process.env.REDIS_URL,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
