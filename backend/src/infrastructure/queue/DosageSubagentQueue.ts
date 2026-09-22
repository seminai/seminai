import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { runFlowsMultiCompany, InputDosageAgent } from '../services/agents/dosage_agent';
import { updateWorkingMemoryAsync } from '../services/agents/dosage_agent_react/working-memory';

const QUEUE_NAME = 'dosage-subagent';
const LOCK_DURATION_MS = 600_000; // 10 min — task isolato, no LLM long-tail
const LOCK_RENEW_TIME_MS = 120_000; // 2 min
const STALLED_INTERVAL_MS = 60_000; // 1 min

/**
 * Payload of a dosage subagent BullMQ job. The parent thread is identified by
 * `threadId` so the worker can write results back to the dosage_agent_react
 * working memory once the calculation completes.
 */
export interface DosageSubagentJobData {
  threadId: string;
  userId: string;
  /** Human-readable task description (debug / observability). */
  task: string;
  /** Same shape consumed by `runFlowsMultiCompany`. */
  input: InputDosageAgent;
}

export interface DosageSubagentJobResult {
  jobId: string;
  status: 'completed' | 'failed';
  outcomeCount: number;
  failedReason?: string;
}

/**
 * Background queue for the `spawn_subagent` tool. Mirrors the matured
 * `DosageAgentQueue` pattern but in a slimmer form (single job type, no
 * multi-company logging or credit deduction — the parent agent session
 * already owns those concerns).
 */
export class DosageSubagentQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;
  public queueEvents: QueueEvents | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[SUBAGENT-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[SUBAGENT-QUEUE] QueueEvents error:', error));
  }

  async addJob(data: DosageSubagentJobData): Promise<string> {
    const job = await this.queue.add('dosage_subagent_job', data, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 200 },
      attempts: 1,
    });
    console.log(
      `[SUBAGENT-QUEUE] Job ${job.id} added for thread ${data.threadId} (task: ${data.task})`,
    );
    return job.id!;
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[SUBAGENT-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<DosageSubagentJobData>): Promise<DosageSubagentJobResult> => {
        const { threadId, userId, input } = job.data;
        const jobId = String(job.id);
        console.log(`[SUBAGENT-QUEUE] Processing job ${jobId} for thread ${threadId}`);
        try {
          const multi = await runFlowsMultiCompany(input, {
            queueJobId: jobId,
            userId,
          });
          const outcome = multi.jobs.flatMap((j) => j.outcomeWithDosage);
          await updateWorkingMemoryAsync(threadId, () => ({
            spawnSubagentResults: {
              jobId,
              status: 'completed',
              outcome,
            },
          }));
          console.log(`[SUBAGENT-QUEUE] Job ${jobId} completed: ${outcome.length} outcome entries`);
          return { jobId, status: 'completed', outcomeCount: outcome.length };
        } catch (error) {
          const failedReason = error instanceof Error ? error.message : String(error);
          console.error(`[SUBAGENT-QUEUE] Job ${jobId} failed:`, error);
          try {
            await updateWorkingMemoryAsync(threadId, () => ({
              spawnSubagentResults: {
                jobId,
                status: 'failed',
                outcome: [],
                failedReason,
              },
            }));
          } catch (wmError) {
            console.error(
              `[SUBAGENT-QUEUE] Failed to persist failure on WM for thread ${threadId}:`,
              wmError,
            );
          }
          throw error;
        }
      },
      {
        connection,
        concurrency: 2,
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_RENEW_TIME_MS,
        stalledInterval: STALLED_INTERVAL_MS,
      },
    );
    this.worker.on('completed', (job) => {
      console.log(`[SUBAGENT-QUEUE] Worker.completed event for ${job.id}`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[SUBAGENT-QUEUE] Worker.failed event for ${job?.id}:`, err);
    });
    console.log('[SUBAGENT-QUEUE] Worker started');
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[SUBAGENT-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[SUBAGENT-QUEUE] QueueEvents stopped');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: DosageSubagentQueue | null = null;

/**
 * Singleton accessor. Starts the worker on first use (no auto-start at module
 * import — keeps tests isolated and respects the `SKIP_QUEUE` env in dev).
 */
export function getDosageSubagentQueue(): DosageSubagentQueue {
  if (!queueInstance) {
    queueInstance = new DosageSubagentQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}

/** Test-only helper to reset the singleton between integration runs. */
export function _resetDosageSubagentQueueForTesting(): void {
  queueInstance = null;
}
