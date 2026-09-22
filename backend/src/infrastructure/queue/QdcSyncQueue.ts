import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { prisma } from '../repositories/Prisma';
import { QdcSyncService } from '../services/integrations/qdc_imageline/sync/qdc-sync.service';

const QUEUE_NAME = 'qdc-sync';
const NIGHTLY_CRON_PATTERN = '30 2 * * *';
const STALE_RUN_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export interface QdcSyncJobData {
  readonly trigger: 'cron' | 'manual';
  readonly syncRunId?: string;
  readonly userId?: string;
}

/**
 * Nightly (and on-demand) QDC → Seminai mirror sync queue.
 * The API process only enqueues manual jobs; the worker process (worker.ts)
 * starts the BullMQ worker and registers the repeatable cron job.
 * Concurrency 1 + DB running-run guard prevent overlapping runs.
 */
export class QdcSyncQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleRepeatingJob(): Promise<void> {
    await this.queue.add('qdc-nightly-sync', { trigger: 'cron' } satisfies QdcSyncJobData, {
      repeat: { pattern: NIGHTLY_CRON_PATTERN },
      removeOnComplete: { age: 7 * 86400, count: 30 },
      removeOnFail: { age: 14 * 86400, count: 50 },
    });
    console.log('[QDC-SYNC] Repeating job scheduled (daily at 02:30)');
  }

  /** Enqueues a manual run for an already-created QdcSyncRun row. */
  async addManualJob(data: { syncRunId: string; userId: string }): Promise<string> {
    const job = await this.queue.add(
      'qdc-manual-sync',
      { trigger: 'manual', ...data } satisfies QdcSyncJobData,
      {
        attempts: 1,
        removeOnComplete: { age: 7 * 86400, count: 30 },
        removeOnFail: { age: 14 * 86400, count: 50 },
      },
    );
    return job.id!;
  }

  startWorker(): void {
    if (this.worker) return;
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<QdcSyncJobData>) => {
        console.log(`[QDC-SYNC] Processing job ${job.id} (${job.data.trigger})`);
        await this.processSync(job.data);
        console.log(`[QDC-SYNC] Job ${job.id} completed`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[QDC-SYNC] Job ${job?.id} failed:`, err);
    });
    console.log('[QDC-SYNC] Worker started');
  }

  private async processSync(data: QdcSyncJobData): Promise<void> {
    await expireStaleRuns();
    const clientId = process.env.IMAGE_LINE_CLIENT_ID?.trim();
    if (data.trigger === 'cron') {
      const enabledCount = await prisma.settings.count({ where: { qdcSyncEnabled: true } });
      if (!shouldRunCronSync({ clientId, enabledCount })) {
        console.log('[QDC-SYNC] Cron skipped (no client id or no user opted in)');
        return;
      }
    }
    if (!clientId) {
      console.warn('[QDC-SYNC] IMAGE_LINE_CLIENT_ID missing, sync aborted');
      return;
    }
    const blocking = await prisma.qdcSyncRun.findFirst({
      where: { status: 'running', ...(data.syncRunId ? { id: { not: data.syncRunId } } : {}) },
    });
    if (blocking) {
      console.log(`[QDC-SYNC] Another run ${blocking.id} is in progress, skipping`);
      return;
    }
    const syncRunId =
      data.syncRunId ??
      (
        await prisma.qdcSyncRun.create({
          data: { trigger: data.trigger, status: 'running' },
        })
      ).id;
    const service = new QdcSyncService({ prisma });
    const outcome = await service.runSync({
      syncRunId,
      trigger: data.trigger,
      clientId,
      userId: data.userId,
    });
    console.log(
      `[QDC-SYNC] Run ${syncRunId} finished: ${outcome.status}`,
      JSON.stringify(outcome.counters),
    );
  }
}

/** Cron gate: env client id present AND at least one user opted in. */
export function shouldRunCronSync(input: {
  clientId: string | undefined;
  enabledCount: number;
}): boolean {
  return Boolean(input.clientId) && input.enabledCount > 0;
}

/** Marks runs stuck in 'running' for more than 3h as errored (crash recovery). */
export async function expireStaleRuns(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_RUN_THRESHOLD_MS);
  const result = await prisma.qdcSyncRun.updateMany({
    where: { status: 'running', startedAt: { lt: threshold } },
    data: { status: 'error', error: 'stalled', finishedAt: new Date() },
  });
  if (result.count > 0) {
    console.warn(`[QDC-SYNC] Expired ${result.count} stalled run(s)`);
  }
  return result.count;
}

let queueInstance: QdcSyncQueue | null = null;

export interface GetQdcSyncQueueOptions {
  /** Start the BullMQ worker + repeatable job (worker process only). */
  readonly startWorker?: boolean;
}

export function getQdcSyncQueue(options?: GetQdcSyncQueueOptions): QdcSyncQueue {
  if (!queueInstance) {
    queueInstance = new QdcSyncQueue();
  }
  if (options?.startWorker && !queueInstance.worker) {
    void queueInstance.scheduleRepeatingJob().catch((error) => {
      console.error('[QDC-SYNC] Failed to schedule repeating job:', error);
    });
    queueInstance.startWorker();
  }
  return queueInstance;
}
