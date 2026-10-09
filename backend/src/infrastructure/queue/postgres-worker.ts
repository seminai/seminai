import { EventEmitter } from 'node:events';
import { ensurePgQueue, queueEvents } from './pg-boss-runtime';
import { PostgresJob } from './postgres-job';
import { getDesktopPool } from '../desktop/database';

/** Workers use pg-boss leases, retry policies and graceful shutdown. */
export class PostgresWorker extends EventEmitter {
  private readonly ready: Promise<string>;
  constructor(
    readonly name: string,
    processor: (job: PostgresJob) => Promise<unknown>,
    options: { concurrency?: number } = {},
  ) {
    super();
    this.on('error', () => console.error('[queue] Worker failed to start'));
    this.ready = this.start(processor, options.concurrency ?? 1);
    void this.ready.catch((error: unknown) => this.emit('error', error));
  }
  private async start(
    processor: (job: PostgresJob) => Promise<unknown>,
    concurrency: number,
  ): Promise<string> {
    const boss = await ensurePgQueue(this.name);
    return boss.work<
      { name: string; value: unknown },
      unknown,
      { includeMetadata: true; localConcurrency: number; pollingIntervalSeconds: number }
    >(
      this.name,
      { includeMetadata: true, localConcurrency: concurrency, pollingIntervalSeconds: 1 },
      async ([record]) => {
        const job = new PostgresJob(this.name, record);
        await getDesktopPool().query(
          'INSERT INTO "DesktopQueueJob" (id,queue,name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [record.id, this.name, job.name],
        );
        this.emit('active', job);
        try {
          const result = await processor(job);
          job.returnvalue = result;
          await boss.complete(
            this.name,
            { id: record.id, retryCount: record.retryCount },
            result && typeof result === 'object' ? result : { value: result },
          );
          this.emit('completed', job, result);
          queueEvents.emit(`${this.name}:completed`, { jobId: job.id });
          return result;
        } catch (error) {
          this.emit('failed', job, error);
          queueEvents.emit(`${this.name}:failed`, {
            jobId: job.id,
            failedReason: error instanceof Error ? error.message : 'Operazione fallita',
          });
          throw error;
        }
      },
    );
  }
  async close(): Promise<void> {
    const id = await this.ready;
    await (await ensurePgQueue(this.name)).offWork(this.name, { id, wait: true });
  }
}

export class PostgresQueueEvents extends EventEmitter {
  private readonly listenersToRemove: Array<{
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];
  constructor(
    readonly name: string,
    _options?: unknown,
  ) {
    super();
    for (const kind of ['completed', 'failed', 'progress', 'stalled']) {
      const event = `${name}:${kind}`;
      const listener = (...args: unknown[]) => this.emit(kind, ...args);
      queueEvents.on(event, listener);
      this.listenersToRemove.push({ event, listener });
    }
  }
  async waitUntilReady(): Promise<void> {
    await ensurePgQueue(this.name);
  }
  async close(): Promise<void> {
    for (const { event, listener } of this.listenersToRemove) queueEvents.off(event, listener);
  }
}
