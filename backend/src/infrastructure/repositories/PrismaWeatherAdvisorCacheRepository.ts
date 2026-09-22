import type { PrismaClient } from '@prisma/client';
import type {
  AgronomistCacheSavePayload,
  CachedAgronomistAdvice,
  IWeatherAdvisorCacheRepository,
} from '../../domain/repositories/IWeatherAdvisorCacheRepository';
import type { TreatmentThresholds } from '../../domain/services/treatment-weather/thresholds';

export class PrismaWeatherAdvisorCacheRepository implements IWeatherAdvisorCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByContextHash(contextHash: string): Promise<CachedAgronomistAdvice | null> {
    const found = await this.prisma.weatherAdvisorCache.findUnique({ where: { contextHash } });
    if (!found) return null;
    return {
      contextHash: found.contextHash,
      thresholds: found.thresholds as unknown as TreatmentThresholds,
      reasoning: found.reasoning,
      confidence: parseConfidence(found.confidence),
      sourceModel: found.sourceModel,
    };
  }

  async save(entry: AgronomistCacheSavePayload): Promise<void> {
    await this.prisma.weatherAdvisorCache.upsert({
      where: { contextHash: entry.contextHash },
      create: {
        contextHash: entry.contextHash,
        thresholds: entry.thresholds as unknown as object,
        reasoning: entry.reasoning,
        confidence: entry.confidence,
        sourceModel: entry.sourceModel,
        promptTokens: entry.promptTokens ?? null,
        completionTokens: entry.completionTokens ?? null,
      },
      update: {
        thresholds: entry.thresholds as unknown as object,
        reasoning: entry.reasoning,
        confidence: entry.confidence,
        sourceModel: entry.sourceModel,
        promptTokens: entry.promptTokens ?? null,
        completionTokens: entry.completionTokens ?? null,
      },
    });
  }
}

function parseConfidence(raw: string): 'high' | 'medium' | 'low' {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'low';
}
