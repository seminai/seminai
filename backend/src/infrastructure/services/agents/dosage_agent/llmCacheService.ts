import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

export class LlmCacheService {
  private readonly prisma: PrismaClient;
  private readonly refreshIntervalMilliseconds: number;

  constructor(prisma: PrismaClient, refreshIntervalDays: number = 5) {
    this.prisma = prisma;
    this.refreshIntervalMilliseconds = refreshIntervalDays * 24 * 60 * 60 * 1000;
  }

  static createStableHash(input: unknown): string {
    const stable = LlmCacheService.stableStringify(input);
    return createHash('sha256').update(stable).digest('hex');
  }

  private static stableStringify(input: unknown): string {
    const seen = new WeakSet<object>();
    const replacer = (_key: string, value: unknown): unknown => {
      if (!value || typeof value !== 'object') {
        return value;
      }
      const obj = value as Record<string, unknown>;
      if (seen.has(obj)) {
        return '[Circular]';
      }
      seen.add(obj);
      if (Array.isArray(obj)) {
        return obj;
      }
      const sortedKeys = Object.keys(obj).sort();
      const sorted: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        sorted[k] = obj[k];
      }
      return sorted;
    };
    return JSON.stringify(input, replacer);
  }

  private isFresh(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() < this.refreshIntervalMilliseconds;
  }

  async getOrRefresh<T>(params: {
    readonly namespace: string;
    readonly cacheKey: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly userId?: string | null;
    readonly computeScore: (payload: T) => number;
    readonly fetchFresh: () => Promise<T>;
  }): Promise<{ readonly payload: T; readonly fromCache: boolean; readonly updated: boolean }> {
    let freshPayload: T | undefined;
    try {
      // Normalize null to 'anonymous' for Prisma constraint (composite unique doesn't support null)
      const userId = params.userId || 'anonymous';
      const existing = await this.prisma.llmCacheEntry.findUnique({
        where: {
          cacheKey_userId: {
            cacheKey: params.cacheKey,
            userId,
          },
        },
      });

      if (existing && this.isFresh(existing.updatedAt)) {
        return { payload: existing.payload as unknown as T, fromCache: true, updated: false };
      }

      freshPayload = await params.fetchFresh();
      const freshScore = params.computeScore(freshPayload);

      if (!existing) {
        await this.prisma.llmCacheEntry.upsert({
          where: {
            cacheKey_userId: {
              cacheKey: params.cacheKey,
              userId,
            },
          },
          create: {
            namespace: params.namespace,
            cacheKey: params.cacheKey,
            userId, // Use normalized value ('anonymous' if null) for consistency with constraint
            model: params.model,
            promptVersion: params.promptVersion,
            payload: freshPayload as unknown as Prisma.InputJsonValue,
            contentScore: freshScore,
            lastCheckedAt: new Date(),
          },
          update: {
            payload: freshPayload as unknown as Prisma.InputJsonValue,
            contentScore: freshScore,
            lastCheckedAt: new Date(),
            model: params.model,
            promptVersion: params.promptVersion,
            namespace: params.namespace,
          },
        });
        return { payload: freshPayload, fromCache: false, updated: true };
      }

      const oldScore = typeof existing.contentScore === 'number' ? existing.contentScore : 0;

      if (freshScore > oldScore) {
        await this.prisma.llmCacheEntry.update({
          where: {
            cacheKey_userId: {
              cacheKey: params.cacheKey,
              userId,
            },
          },
          data: {
            payload: freshPayload as unknown as Prisma.InputJsonValue,
            contentScore: freshScore,
            lastCheckedAt: new Date(),
            model: params.model,
            promptVersion: params.promptVersion,
            namespace: params.namespace,
          },
        });
        return { payload: freshPayload, fromCache: false, updated: true };
      }

      await this.prisma.llmCacheEntry.update({
        where: {
          cacheKey_userId: {
            cacheKey: params.cacheKey,
            userId,
          },
        },
        data: { lastCheckedAt: new Date() },
      });
      return { payload: existing.payload as unknown as T, fromCache: true, updated: false };
    } catch (error) {
      // If the cache table is not migrated yet or DB is unavailable, gracefully degrade.
      if (freshPayload !== undefined) {
        return { payload: freshPayload, fromCache: false, updated: false };
      }
      const fallbackFreshPayload = await params.fetchFresh();
      return { payload: fallbackFreshPayload, fromCache: false, updated: false };
    }
  }
}
