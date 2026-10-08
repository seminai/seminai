import { getDesktopPool } from './database';
import { getRedisConnection } from '../queue/redis.connection';

class PostgresKeyValueStore {
  async get(key: string): Promise<string | null> {
    const result = await getDesktopPool().query<{ value: string }>(
      'SELECT value FROM "LocalKeyValue" WHERE key=$1 AND "expiresAt">now()',
      [key],
    );
    return result.rows[0]?.value ?? null;
  }
  async set(key: string, value: string, mode = 'EX', ttl = 1800): Promise<string> {
    if (mode !== 'EX') throw new Error('Only expiring values are supported');
    await getDesktopPool().query(
      'INSERT INTO "LocalKeyValue" (key,value,"expiresAt") VALUES ($1,$2,now()+$3*interval \'1 second\') ON CONFLICT (key) DO UPDATE SET value=excluded.value,"expiresAt"=excluded."expiresAt"',
      [key, value, ttl],
    );
    return 'OK';
  }
  setex(key: string, ttl: number, value: string): Promise<string> {
    return this.set(key, value, 'EX', ttl);
  }
  mget(...keys: string[]): Promise<Array<string | null>> {
    return Promise.all(keys.map((key) => this.get(key)));
  }
  async del(key: string): Promise<number> {
    return (
      (await getDesktopPool().query('DELETE FROM "LocalKeyValue" WHERE key=$1', [key])).rowCount ??
      0
    );
  }
  async ping(): Promise<string> {
    await getDesktopPool().query('SELECT 1');
    return 'PONG';
  }
  async info(_section?: string): Promise<string> {
    return 'storage:postgresql';
  }
  /** Atomic fixed-window counter, used exclusively by the rate limiter. */
  async eval(_script: string, count: number, key: string, ttl: number): Promise<number> {
    if (count !== 1) throw new Error('Unsupported counter operation');
    const result = await getDesktopPool().query<{ value: string }>(
      `INSERT INTO "LocalKeyValue" (key,value,"expiresAt") VALUES ($1,'1',now()+$2*interval '1 second') ON CONFLICT (key) DO UPDATE SET value=CASE WHEN "LocalKeyValue"."expiresAt"<=now() THEN '1' ELSE (("LocalKeyValue".value)::int+1)::text END,"expiresAt"=CASE WHEN "LocalKeyValue"."expiresAt"<=now() THEN excluded."expiresAt" ELSE "LocalKeyValue"."expiresAt" END RETURNING value`,
      [key, ttl],
    );
    return Number(result.rows[0].value);
  }
}
const local = new PostgresKeyValueStore();
export function getRuntimeStore() {
  return process.env.RUNTIME_PROFILE === 'desktop' ? local : getRedisConnection();
}
