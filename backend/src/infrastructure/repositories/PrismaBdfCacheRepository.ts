import { PrismaClient } from '@prisma/client';
import type {
  BdfCacheEntry,
  IBdfCacheRepository,
} from '../../domain/repositories/IBdfCacheRepository';

export class PrismaBdfCacheRepository implements IBdfCacheRepository {
  constructor(private prisma: PrismaClient) {}

  async get(endpoint: string, cacheKey: string): Promise<BdfCacheEntry | null> {
    const entry = await this.prisma.bdfCache.findUnique({
      where: { endpoint_cacheKey: { endpoint, cacheKey } },
    });

    if (!entry) return null;

    return {
      id: entry.id,
      endpoint: entry.endpoint,
      cacheKey: entry.cacheKey,
      params: entry.params as Record<string, unknown> | null,
      data: entry.data,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  async set(
    endpoint: string,
    cacheKey: string,
    data: unknown,
    params?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.bdfCache.upsert({
      where: { endpoint_cacheKey: { endpoint, cacheKey } },
      create: {
        endpoint,
        cacheKey,
        data: data as any,
        params: (params as any) ?? undefined,
      },
      update: {
        data: data as any,
        params: (params as any) ?? undefined,
      },
    });
  }

  async invalidate(endpoint: string, cacheKey: string): Promise<void> {
    await this.prisma.bdfCache.deleteMany({
      where: { endpoint, cacheKey },
    });
  }

  async invalidateByEndpoint(endpoint: string): Promise<void> {
    await this.prisma.bdfCache.deleteMany({
      where: { endpoint },
    });
  }

  async invalidateExpired(maxAgeDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.bdfCache.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
