import { createHash, randomUUID } from 'node:crypto';
import type { JobsOptions } from 'bullmq';
import { getDesktopPool } from '../desktop/database';
import { ensurePgQueue } from './pg-boss-runtime';
import { PostgresJob } from './postgres-job';

/** PostgreSQL queue adapter; enqueue and metadata commit in the same transaction. */
export class PostgresQueue {
  readonly opts = { prefix: 'seminai' };
  constructor(
    readonly name: string,
    private readonly options: { defaultJobOptions?: JobsOptions } = {},
  ) {}
  async add<T>(name: string, value: T, overrides: JobsOptions = {}) {
    const options = { ...this.options.defaultJobOptions, ...overrides };
    const boss = await ensurePgQueue(this.name);
    const payload = { name, value };
    if (options.repeat?.pattern) {
      await boss.schedule(this.name, options.repeat.pattern, payload);
      return { id: `schedule:${this.name}` };
    }
    const id = options.jobId ? stableUuid(`${this.name}:${options.jobId}`) : randomUUID();
    const database = await getDesktopPool().connect();
    try {
      await database.query('BEGIN');
      const sent = await boss.send(this.name, payload, {
        id,
        db: { executeSql: (text, values) => database.query(text, values) },
        retryLimit: Math.max(0, (options.attempts ?? 3) - 1),
        retryDelay:
          typeof options.backoff === 'object'
            ? Math.max(1, (options.backoff.delay ?? 1000) / 1000)
            : 5,
        retryBackoff: typeof options.backoff === 'object' && options.backoff.type === 'exponential',
        startAfter: options.delay ? new Date(Date.now() + options.delay) : undefined,
      });
      if (sent)
        await database.query(
          'INSERT INTO "DesktopQueueJob" (id,queue,name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, this.name, name],
        );
      await database.query('COMMIT');
      return { id };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    } finally {
      database.release();
    }
  }
  async getJob(id: string): Promise<PostgresJob | undefined> {
    const boss = await ensurePgQueue(this.name);
    const record = await boss.getJobById<{ name: string; value: unknown }>(this.name, id);
    if (!record) return undefined;
    const result = await getDesktopPool().query<{ progress: number | object }>(
      'SELECT progress FROM "DesktopQueueJob" WHERE id=$1',
      [id],
    );
    return new PostgresJob(this.name, record, result.rows[0]?.progress);
  }
  async getJobCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
    await ensurePgQueue(this.name);
    const result = await getDesktopPool().query<{ state: string; count: string }>(
      'SELECT state,count(*) FROM seminai_queue.job WHERE name=$1 GROUP BY state',
      [this.name],
    );
    for (const row of result.rows)
      counts[row.state === 'created' || row.state === 'retry' ? 'waiting' : row.state] = Number(
        row.count,
      );
    return counts;
  }
  async close(): Promise<void> {
    /* Shared pool is owned by the runtime supervisor. */
  }
}
function stableUuid(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
