import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { prisma } from '../repositories/Prisma';
import { OuterLoopService } from '../services/agents/dosage_agent_react/outer-loop/outer-loop.service';
import { EmailService } from '../services/EmailService';
import { PrismaNotificationRepository } from '../repositories/PrismaNotificationRepository';
import { PrismaFileRepository } from '../repositories/PrismaFileRepository';
import { Notification } from '../../domain/entities/Notification';
import { createChatEmitter } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';

const QUEUE_NAME = 'outer-loop-processor';

export class OuterLoopProcessorQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleRepeatingJob(): Promise<void> {
    await this.queue.add(
      'process-pending-triggers',
      {},
      {
        repeat: { pattern: '*/5 * * * *' },
        removeOnComplete: { age: 3600, count: 100 },
        removeOnFail: { age: 7200, count: 500 },
      },
    );
    console.log('[OUTER-LOOP] Repeating job scheduled (every 5 min)');
  }

  startWorker(): void {
    if (this.worker) return;
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'execute-trigger') {
          const { triggerId } = job.data as { triggerId: string };
          console.log(`[OUTER-LOOP] Executing delayed trigger ${triggerId}`);
          await this.executeSingleTrigger(triggerId);
        } else {
          console.log(`[OUTER-LOOP] Processing pending triggers (job ${job.id})`);
          await this.processPendingTriggers();
        }
        console.log(`[OUTER-LOOP] Job ${job.id} completed`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[OUTER-LOOP] Job ${job?.id} failed:`, err);
    });
    console.log('[OUTER-LOOP] Worker started');
  }

  /**
   * Executes a single trigger by ID (called by delayed BullMQ jobs).
   * Skips if trigger is no longer pending (already processed by polling or dismissed).
   */
  private async executeSingleTrigger(triggerId: string): Promise<void> {
    const trigger = await prisma.outerLoopTrigger.findUnique({
      where: { id: triggerId },
    });
    if (!trigger || trigger.status !== 'pending') {
      console.log(`[OUTER-LOOP] Trigger ${triggerId} already processed, skipping`);
      return;
    }
    const outerLoopService = new OuterLoopService();
    const notificationRepo = new PrismaNotificationRepository(prisma);
    const emailService = EmailService.getInstance();
    const fileRepo = new PrismaFileRepository(prisma);
    await this.executeTrigger({
      trigger,
      outerLoopService,
      notificationRepo,
      emailService,
      fileRepo,
    });
  }

  private async processPendingTriggers(): Promise<void> {
    const triggers = await prisma.outerLoopTrigger.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
    if (triggers.length === 0) return;
    console.log(`[OUTER-LOOP] Found ${triggers.length} pending triggers`);
    const outerLoopService = new OuterLoopService();
    const notificationRepo = new PrismaNotificationRepository(prisma);
    const emailService = EmailService.getInstance();
    const fileRepo = new PrismaFileRepository(prisma);
    for (const trigger of triggers) {
      try {
        await this.executeTrigger({
          trigger,
          outerLoopService,
          notificationRepo,
          emailService,
          fileRepo,
        });
      } catch (error) {
        console.error(`[OUTER-LOOP] Failed to execute trigger ${trigger.id}:`, error);
      }
    }
  }

  private async executeTrigger(deps: {
    readonly trigger: {
      readonly id: string;
      readonly userId: string;
      readonly type: string;
      readonly title: string;
      readonly payload: unknown;
      readonly threadId?: string | null;
    };
    readonly outerLoopService: OuterLoopService;
    readonly notificationRepo: PrismaNotificationRepository;
    readonly emailService: EmailService;
    readonly fileRepo: PrismaFileRepository;
  }): Promise<void> {
    const { trigger, outerLoopService, notificationRepo, emailService, fileRepo } = deps;
    const payload = trigger.payload as Record<string, unknown>;
    const user = await prisma.user.findUnique({
      where: { id: trigger.userId },
      select: { email: true, name: true },
    });
    if (!user) {
      console.warn(`[OUTER-LOOP] User ${trigger.userId} not found, skipping trigger ${trigger.id}`);
      await outerLoopService.executeAlert(trigger.id);
      return;
    }
    const message = this.buildMessage(trigger.type, trigger.title, payload);
    await notificationRepo.create(
      Notification.create({
        userId: trigger.userId,
        type: trigger.type,
        title: trigger.title,
        message,
        companyId: payload.companyId as string | undefined,
        metadata: payload,
      }),
    );
    try {
      await emailService.sendRawEmail({
        to: user.email,
        subject: trigger.title,
        text: message,
      });
    } catch (error) {
      console.error(`[OUTER-LOOP] Email failed for trigger ${trigger.id}:`, error);
    }
    if (trigger.type === 'file_expiry' && payload.fileId) {
      await fileRepo.updateAlertStatus(payload.fileId as string, 'sent');
    }
    // Push real-time alert via Socket.IO if a threadId is available
    if (trigger.threadId) {
      const emitter = createChatEmitter(trigger.threadId);
      emitter?.emitOuterLoopAlert({
        triggerId: trigger.id,
        type: trigger.type,
        title: trigger.title,
        payload,
      });
    }
    await outerLoopService.executeAlert(trigger.id);
  }

  private buildMessage(type: string, title: string, payload: Record<string, unknown>): string {
    if (type === 'file_expiry') {
      const days = payload.daysUntilExpiry as number;
      return `Il file "${payload.fileName}" scadrà tra ${days} giorni (${payload.expiresAt}).`;
    }
    return title;
  }
}

let instance: OuterLoopProcessorQueue | null = null;

export function getOuterLoopProcessorQueue(): OuterLoopProcessorQueue {
  if (!instance) {
    instance = new OuterLoopProcessorQueue();
    if (shouldStartQueueWorkers()) {
      instance.scheduleRepeatingJob();
      instance.startWorker();
    }
  }
  return instance;
}
