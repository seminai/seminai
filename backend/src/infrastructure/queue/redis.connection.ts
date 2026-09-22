import { Redis, type RedisOptions } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisClient) {
    const isProduction = process.env.NODE_ENV === 'production';
    let redisUrl: string;
    let redisOptions: RedisOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
    if (isProduction) {
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!upstashUrl || !upstashToken) {
        throw new Error(
          '[REDIS] Production mode requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
        );
      }
      const url = new URL(upstashUrl);
      const host = url.hostname;
      const port = url.port || '6379';
      redisUrl = `rediss://:${upstashToken}@${host}:${port}`;
      redisOptions = {
        ...redisOptions,
        /**
         * Cloud Run non garantisce connettività IPv6 verso Upstash.
         * Usiamo famiglia auto (IPv4) per evitare errori DNS ESERVFAIL.
         */
        family: 0,
        tls: {
          rejectUnauthorized: true,
        },
      };
      console.log(`[REDIS] Connecting to Upstash Redis (production) at ${host}:${port}`);
    } else {
      redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      console.log(`[REDIS] Connecting to local Redis (development) at ${redisUrl}`);
    }
    redisClient = new Redis(redisUrl, redisOptions);
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
