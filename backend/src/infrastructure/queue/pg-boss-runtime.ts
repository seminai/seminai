import type { PgBoss } from 'pg-boss';
import { EventEmitter } from 'node:events';
let started: Promise<PgBoss> | undefined;
const queues = new Map<string, Promise<void>>();
export const queueEvents = new EventEmitter();
queueEvents.setMaxListeners(100);
export function getPgBoss(): Promise<PgBoss> {
  started ??= (async () => {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      schema: 'seminai_queue',
      max: 5,
    });
    (boss as unknown as EventEmitter).on('error', () =>
      console.error('[queue] PostgreSQL queue error'),
    );
    await boss.start();
    return boss;
  })();
  return started;
}
export async function ensurePgQueue(name: string): Promise<PgBoss> {
  const boss = await getPgBoss();
  if (!queues.has(name))
    queues.set(
      name,
      boss.createQueue(name, {
        retryLimit: 2,
        retryDelay: 5,
        expireInSeconds: 3600,
        heartbeatSeconds: 30,
        retentionSeconds: 86400 * 7,
      }),
    );
  await queues.get(name);
  return boss;
}
export async function closePgBoss(): Promise<void> {
  if (started) await (await started).stop({ graceful: true, timeout: 25000 });
  started = undefined;
  queues.clear();
}
