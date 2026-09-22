import { PrismaClient } from '@prisma/client';
import { logger } from '../../../infrastructure/services/logger.service';

interface ServiceHealth {
  readonly status: 'up' | 'down';
  readonly responseTime?: number;
  readonly error?: string;
}

export interface HealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly timestamp: string;
  readonly uptime: number;
  readonly database: ServiceHealth;
  readonly redis: ServiceHealth;
  readonly services: {
    readonly server: boolean;
    readonly prisma: boolean;
    readonly redis: boolean;
  };
}

export class CheckHealthUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const prismaUp = database.status === 'up';
    const redisUp = redis.status === 'up';
    const overallStatus = prismaUp && redisUp ? 'healthy' : prismaUp ? 'degraded' : 'unhealthy';
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database,
      redis,
      services: {
        server: true,
        prisma: prismaUp,
        redis: redisUp,
      },
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', responseTime: Date.now() - start };
    } catch (error) {
      logger.error('Health check: database connection failed', { error: String(error) });
      return { status: 'down', error: 'Database connection failed' };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    try {
      const { getRedisConnection } = await import('../../../infrastructure/queue/redis.connection');
      const redis = getRedisConnection();
      const start = Date.now();
      await redis.ping();
      return { status: 'up', responseTime: Date.now() - start };
    } catch (error) {
      logger.error('Health check: Redis connection failed', { error: String(error) });
      return { status: 'down', error: 'Redis connection failed' };
    }
  }
}
