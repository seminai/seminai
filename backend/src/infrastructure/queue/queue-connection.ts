import type { Redis } from 'ioredis';
import { getRedisConnection as getRedis } from './redis.connection';
/** PostgreSQL queue constructors ignore the BullMQ connection option. */
export function getRedisConnection(): Redis {
  if (process.env.RUNTIME_PROFILE === 'desktop') return {} as Redis;
  return getRedis();
}
