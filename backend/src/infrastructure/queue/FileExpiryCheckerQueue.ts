import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { PrismaFileRepository } from '../repositories/PrismaFileRepository';
import { prisma } from '../repositories/Prisma';
import { OuterLoopService } from '../services/agents/dosage_agent_react/outer-loop/outer-loop.service';

const QUEUE_NAME = 'file-expiry-checker';

export class FileExpiryCheckerQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleRepeatingJob(): Promise<void> {
    await this.queue.add(
      'check-expiring-files',
      {},
      {
        repeat: { pattern: '0 8 * * *' },
        removeOnComplete: { age: 86400, count: 30 },
        removeOnFail: { age: 172800, count: 100 },
      },
    );
    console.log('[FILE-EXPIRY] Repeating job scheduled (daily at 08:00)');
  }

  startWorker(): void {
    if (this.worker) return;
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        console.log(`[FILE-EXPIRY] Processing job ${job.id}`);
        await this.processExpiringFiles();
        console.log(`[FILE-EXPIRY] Job ${job.id} completed`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[FILE-EXPIRY] Job ${job?.id} failed:`, err);
    });
    console.log('[FILE-EXPIRY] Worker started');
  }

  private async processExpiringFiles(): Promise<void> {
    const fileRepository = new PrismaFileRepository(prisma);
    const outerLoopService = new OuterLoopService();
    const now = new Date();
    const expiringFiles = await fileRepository.findExpiring({
      referenceDate: now,
      alertStatuses: ['none'],
    });
    if (expiringFiles.length === 0) {
      console.log('[FILE-EXPIRY] No expiring files found');
      return;
    }
    console.log(`[FILE-EXPIRY] Found ${expiringFiles.length} expiring files`);
    for (const file of expiringFiles) {
      await this.scheduleAlertsForFile(file, outerLoopService);
      await fileRepository.updateAlertStatus(file.id, 'scheduled');
    }
  }

  private async scheduleAlertsForFile(
    file: {
      readonly id: string;
      readonly name: string;
      readonly companyId: string;
      readonly expiresAt?: Date;
    },
    outerLoopService: OuterLoopService,
  ): Promise<void> {
    const companyUsers = await prisma.userOnCompany.findMany({
      where: { companyId: file.companyId },
      select: { userId: true },
    });
    const daysUntilExpiry = file.expiresAt
      ? Math.ceil((file.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;
    for (const { userId } of companyUsers) {
      await outerLoopService.scheduleAlert({
        userId,
        type: 'file_expiry',
        title: `File "${file.name}" in scadenza`,
        payload: {
          fileId: file.id,
          fileName: file.name,
          companyId: file.companyId,
          expiresAt: file.expiresAt?.toISOString(),
          daysUntilExpiry,
        },
        scheduledAt: new Date(),
      });
    }
  }
}

let instance: FileExpiryCheckerQueue | null = null;

export function getFileExpiryCheckerQueue(): FileExpiryCheckerQueue {
  if (!instance) {
    instance = new FileExpiryCheckerQueue();
    if (shouldStartQueueWorkers()) {
      instance.scheduleRepeatingJob();
      instance.startWorker();
    }
  }
  return instance;
}
