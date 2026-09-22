import { Redis, type RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;

export interface RedisTarget {
  readonly url: string;
  readonly tls?: RedisOptions['tls'];
}

export interface RedisEnv {
  readonly REDIS_URL?: string;
  readonly NODE_ENV?: string;
  readonly UPSTASH_REDIS_REST_URL?: string;
  readonly UPSTASH_REDIS_REST_TOKEN?: string;
}

export function resolveRedisTarget(env: RedisEnv = process.env): RedisTarget {
  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }
  if (env.NODE_ENV !== 'production') {
    return { url: 'redis://localhost:6379' };
  }
  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;
  if (!upstashUrl || !upstashToken) {
    throw new Error(
      '[REDIS] Production mode requires REDIS_URL or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
    );
  }
  const url = new URL(upstashUrl);
  const port = url.port || '6379';
  return {
    url: `rediss://:${upstashToken}@${url.hostname}:${port}`,
    tls: { rejectUnauthorized: true },
  };
}

export function getRedisConnection(): Redis {
  if (!redisClient) {
    const target = resolveRedisTarget();
    const redisOptions: RedisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      family: target.tls ? 0 : undefined,
      tls: target.tls,
    };
    redisClient = new Redis(target.url, redisOptions);
    redisClient.on('error', (err) => {
      console.error('[REDIS] Connection error:', err);
    });
    redisClient.on('connect', () => {
      console.log('[REDIS] Connected successfully');
    });
    redisClient.on('ready', () => {
      console.log('[REDIS] Client ready');
    });
  }
  return redisClient;
}

export function closeRedisConnection(): void {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}
