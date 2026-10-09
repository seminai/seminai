import { getDesktopPool } from '../desktop/database';
import { ensurePgQueue, queueEvents } from './pg-boss-runtime';
import type { JobWithMetadata } from 'pg-boss';

/** The subset of a queue job used by Seminai processors, backed by PostgreSQL. */
export class PostgresJob<T = unknown> {
  readonly id: string;
  readonly data: T;
  readonly name: string;
  readonly token: string;
  progress: number | object;
  returnvalue: unknown;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  constructor(
    readonly queueName: string,
    readonly record: JobWithMetadata<{ name: string; value: T }>,
    progress: number | object = 0,
  ) {
    this.id = record.id;
    this.data = record.data.value;
    this.name = record.data.name;
    this.token = `${record.id}:${record.retryCount}`;
    this.progress = progress;
    this.returnvalue = record.output;
    this.failedReason =
      record.state === 'failed'
        ? String((record.output as { message?: string })?.message || 'Operazione fallita')
        : undefined;
    this.processedOn = record.startedOn?.getTime();
    this.finishedOn = record.completedOn?.getTime();
  }
  async getState(): Promise<string> {
    const record = await (await ensurePgQueue(this.queueName)).getJobById(this.queueName, this.id);
    const state = record?.state;
    return state === 'created' || state === 'retry'
      ? 'waiting'
      : state === 'cancelled'
        ? 'failed'
        : state || 'unknown';
  }
  async updateProgress(progress: number | object): Promise<void> {
    this.progress = progress;
    await getDesktopPool().query('UPDATE "DesktopQueueJob" SET progress=$2::jsonb WHERE id=$1', [
      this.id,
      JSON.stringify(progress),
    ]);
    queueEvents.emit(`${this.queueName}:progress`, { jobId: this.id, data: progress });
  }
  async log(message: string): Promise<number> {
    await getDesktopPool().query(
      'UPDATE "DesktopQueueJob" SET logs=logs || $2::jsonb WHERE id=$1',
      [this.id, JSON.stringify([message])],
    );
    return 1;
  }
  async remove(): Promise<void> {
    if ((await this.getState()) === 'active')
      throw new Error('Attendi il completamento del lavoro prima di rimuoverlo');
    await (await ensurePgQueue(this.queueName)).deleteJob(this.queueName, this.id);
    await getDesktopPool().query('DELETE FROM "DesktopQueueJob" WHERE id=$1', [this.id]);
  }
  async moveToFailed(error: Error): Promise<void> {
    await (
      await ensurePgQueue(this.queueName)
    ).fail(
      this.queueName,
      { id: this.id, retryCount: this.record.retryCount },
      { message: error.message },
    );
  }
}
