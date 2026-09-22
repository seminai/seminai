import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { prisma } from '../repositories/Prisma';

const QUEUE_NAME = 'agent-stream-event-cleanup';

const COMPACTABLE_EVENT_TYPES: ReadonlyArray<string> = [
  'token',
  'tool_call',
  'tool_result',
  'pipeline_progress',
  'loop_warning',
  'thinking',
  'working_memory_update',
];

const TERMINAL_EVENT_TYPES: ReadonlyArray<string> = ['complete', 'error', 'cancelled'];

/**
 * Periodic job that compacts the `AgentStreamEvent` table: for each thread
 * whose most recent event is terminal, deletes the high-frequency events
 * (tokens, tool calls, progress) preceding the terminator. Extraction-review
 * events and pending `requires_approval` events are preserved for audit and
 * resume of paused threads.
 */
export class AgentStreamEventCleanupQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async scheduleRepeatingJob(): Promise<void> {
    await this.queue.add(
      'compact-stream-events',
      {},
      {
        repeat: { pattern: '17 * * * *' },
        removeOnComplete: { age: 86400, count: 30 },
        removeOnFail: { age: 172800, count: 50 },
      },
    );
    console.log('[STREAM-EVENT-CLEANUP] Repeating job scheduled (every hour at :17)');
  }

  startWorker(): void {
    if (this.worker) return;
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        console.log(`[STREAM-EVENT-CLEANUP] Processing job ${job.id}`);
        const deleted = await this.compact();
        console.log(`[STREAM-EVENT-CLEANUP] Job ${job.id} completed (${deleted} rows deleted)`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[STREAM-EVENT-CLEANUP] Job ${job?.id} failed:`, err);
    });
    console.log('[STREAM-EVENT-CLEANUP] Worker started');
  }

  private async compact(): Promise<number> {
    const terminalEvents = await prisma.agentStreamEvent.findMany({
      where: { type: { in: [...TERMINAL_EVENT_TYPES] } },
      select: { threadId: true, seq: true },
      orderBy: { seq: 'desc' },
    });
    const latestTerminalByThread = new Map<string, number>();
    for (const row of terminalEvents) {
      if (!latestTerminalByThread.has(row.threadId)) {
        latestTerminalByThread.set(row.threadId, row.seq);
      }
    }
    if (latestTerminalByThread.size === 0) return 0;
    let totalDeleted = 0;
    for (const [threadId, terminalSeq] of latestTerminalByThread) {
      const result = await prisma.agentStreamEvent.deleteMany({
        where: {
          threadId,
          seq: { lt: terminalSeq },
          type: { in: [...COMPACTABLE_EVENT_TYPES] },
        },
      });
      totalDeleted += result.count;
    }
    return totalDeleted;
  }
}

let instance: AgentStreamEventCleanupQueue | null = null;

export function getAgentStreamEventCleanupQueue(): AgentStreamEventCleanupQueue {
  if (!instance) {
    instance = new AgentStreamEventCleanupQueue();
    if (shouldStartQueueWorkers()) {
      void instance.scheduleRepeatingJob();
      instance.startWorker();
    }
  }
  return instance;
}
