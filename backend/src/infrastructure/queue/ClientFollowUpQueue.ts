import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { prisma } from '../repositories/Prisma';
import { PrismaBusinessPartnerRepository } from '../repositories/PrismaBusinessPartnerRepository';
import { PrismaCompanyRepository } from '../repositories/PrismaCompanyRepository';
import { EmailService } from '../services/EmailService';
import { SendClientFollowUpUseCase } from '../../application/use-cases/client-follow-up/SendClientFollowUpUseCase';

const QUEUE_NAME = 'client-follow-up';
/** Minimum gap between two reminders to the same customer (weekly default). */
const FOLLOW_UP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export class ClientFollowUpQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleRepeatingJob(): Promise<void> {
    await this.queue.add(
      'send-client-follow-ups',
      {},
      {
        repeat: { pattern: '0 7 * * *' },
        removeOnComplete: { age: 86400, count: 30 },
        removeOnFail: { age: 172800, count: 100 },
      },
    );
    console.log('[CLIENT-FOLLOWUP] Repeating job scheduled (daily at 07:00)');
  }

  startWorker(): void {
    if (this.worker) return;
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        console.log(`[CLIENT-FOLLOWUP] Processing job ${job.id}`);
        await this.processFollowUps();
        console.log(`[CLIENT-FOLLOWUP] Job ${job.id} completed`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[CLIENT-FOLLOWUP] Job ${job?.id} failed:`, err);
    });
    console.log('[CLIENT-FOLLOWUP] Worker started');
  }

  private async processFollowUps(): Promise<void> {
    const partnerRepository = new PrismaBusinessPartnerRepository(prisma);
    const companyRepository = new PrismaCompanyRepository(prisma);
    const useCase = new SendClientFollowUpUseCase(
      companyRepository,
      partnerRepository,
      EmailService.getInstance(),
    );
    const before = new Date(Date.now() - FOLLOW_UP_INTERVAL_MS);
    const due = await partnerRepository.findDueForFollowUp(before);
    if (due.length === 0) {
      console.log('[CLIENT-FOLLOWUP] No customers due for a follow-up');
      return;
    }
    let sent = 0;
    for (const partner of due) {
      try {
        const result = await useCase.execute(partner);
        if (result.sent) sent += 1;
      } catch (err) {
        console.error(`[CLIENT-FOLLOWUP] Failed for partner ${partner.id}:`, err);
      }
    }
    console.log(`[CLIENT-FOLLOWUP] Sent ${sent}/${due.length} reminders`);
  }
}

let instance: ClientFollowUpQueue | null = null;

export function getClientFollowUpQueue(): ClientFollowUpQueue {
  if (!instance) {
    instance = new ClientFollowUpQueue();
    if (shouldStartQueueWorkers()) {
      instance.scheduleRepeatingJob();
      instance.startWorker();
    }
  }
  return instance;
}
